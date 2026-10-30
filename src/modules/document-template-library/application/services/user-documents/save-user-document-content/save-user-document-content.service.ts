// Use case thay nội dung Office bằng object mới rồi chỉ xóa file cũ sau khi database commit.
import {
    Inject,
    Injectable,
    Logger,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
    type UserDocumentSummary,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import {
    USER_DOCUMENT_WRITER,
    type ExpectedUserDocumentFile,
    type UserDocumentWriterContract,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { toUserDocumentSummary } from '@/modules/document-template-library/application/utils/to-user-document-summary';
import { getOfficeDocumentFormat } from '@/modules/document-template-library/application/types/office-document-format/office-document-format';

@Injectable()
// Điều phối ghi file, transaction thay reference và cleanup; file hiện tại còn dùng được tới khi commit.
export class SaveUserDocumentContentService {
    private readonly logger = new Logger(SaveUserDocumentContentService.name);

    // Reader xác nhận quyền sở hữu/trạng thái; writer quản lý transaction đổi metadata file.
    // Storage chỉ tạo hoặc xóa object vật lý; service phối hợp qua contract, không phụ thuộc TypeORM.
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findUserDocumentById' | 'findUserDocumentByIdForWorkspace'
        >,
        @Inject(USER_DOCUMENT_WRITER)
        private readonly documentWriter: UserDocumentWriterContract,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    // Luồng HTTP đọc qua reader lọc workspace; ID thuộc workspace khác được coi như không tồn tại.
    // Chỉ sau khi xác nhận quyền sở hữu, service mới chuyển nội dung sang pipeline ghi file chung.
    async executeForWorkspace(
        documentId: string,
        workspaceId: string,
        content: Buffer,
        uploadedFilename: string,
    ): Promise<UserDocumentSummary> {
        const current =
            await this.documentReader.findUserDocumentByIdForWorkspace(
                documentId,
                workspaceId,
            );

        return this.saveCurrentDocument(
            documentId,
            current,
            content,
            uploadedFilename,
        );
    }

    // Chỉ handler ONLYOFFICE gọi sau khi xác minh JWT, payload và editor key của callback.
    // Reader tra theo ID vì Document Server không gửi cookie workspace; writer sẽ so lại file revision kỳ vọng.
    async executeFromOnlyOfficeCallback(
        documentId: string,
        content: Buffer,
        uploadedFilename: string,
        expectedCurrentFile: ExpectedUserDocumentFile,
    ): Promise<UserDocumentSummary> {
        const current =
            await this.documentReader.findUserDocumentById(documentId);

        return this.saveCurrentDocument(
            documentId,
            current,
            content,
            uploadedFilename,
            expectedCurrentFile,
        );
    }

    // Bước 1 từ chối tài liệu không tồn tại hoặc chưa READY trước mọi thao tác filesystem.
    // Bước 2 chuẩn hóa tên hiển thị rồi ghi nội dung vào UUID key mới trước khi đổi database reference.
    // Bước 3 yêu cầu writer thay reference; callback có expectedCurrentFile được kiểm tra revision trong transaction.
    // Sau commit chỉ dọn object cũ; nếu thay reference lỗi thì dọn object mới và giữ nguyên lỗi ban đầu.
    private async saveCurrentDocument(
        documentId: string,
        current: Awaited<
            ReturnType<UserDocumentReaderContract['findUserDocumentById']>
        >,
        content: Buffer,
        uploadedFilename: string,
        expectedCurrentFile?: ExpectedUserDocumentFile,
    ): Promise<UserDocumentSummary> {
        // Bước 1.1: reader không tìm thấy ID hoặc owner thì trả cùng 404, không để lộ tài liệu workspace khác.
        if (!current) {
            throw new UserDocumentNotFoundError();
        }

        // Bước 1.2: chỉ READY có output file mới có revision để thay; từ chối trước khi tạo object mới.
        if (current.status !== 'ready' || !current.outputFile) {
            throw new UserDocumentNotReadyError(
                'Chỉ có thể lưu nội dung cho tài liệu đã sẵn sàng.',
            );
        }

        // Bước 2.1: chuẩn hóa tên trước khi kiểm tra extension vì client có thể gửi path Windows và CR/LF cuối tên.
        const originalFilename = basename(uploadedFilename.replace(/\\/g, '/'))
            .replace(/[\r\n]/g, '')
            .slice(0, 255);

        // Bước 2.2: MIME của file hiện hành quyết định format; tên đã chuẩn hóa phải cùng extension để không đổi DOCX/PPTX.
        const fileFormat = getOfficeDocumentFormat(current.outputFile.mimeType);
        if (
            !fileFormat ||
            !originalFilename.toLowerCase().endsWith(`.${fileFormat.extension}`)
        ) {
            throw new UnsupportedMediaTypeException(
                'File tải lên phải cùng định dạng với tài liệu đang sửa.',
            );
        }

        // Bước 2.3: dùng UUID làm object key; nếu storage lỗi thì database chưa bị thay đổi.
        const newFile = await this.fileStorage.saveEditedDocument(
            content,
            `${randomUUID()}.${fileFormat.extension}`,
            originalFilename || `document.${fileFormat.extension}`,
        );

        try {
            // Bước 3: writer atomically chuyển metadata sang file mới; expectedCurrentFile chặn callback revision cũ.
            const replaced = await this.documentWriter.replaceDocumentFile(
                documentId,
                newFile,
                expectedCurrentFile,
            );

            // Bước 4: writer trả về sau commit; lúc này mới xóa object cũ vì database đã trỏ sang file mới.
            if (replaced.previousFile) {
                try {
                    await this.fileStorage.removeUserDocument(
                        replaced.previousFile,
                    );
                } catch (cleanupError) {
                    // Xóa file cũ lỗi chỉ để lại orphan; cảnh báo vận hành nhưng vẫn giữ kết quả đã commit.
                    this.logger.warn(
                        `Không dọn được file phiên bản cũ của tài liệu ${documentId}.`,
                        cleanupError instanceof Error
                            ? cleanupError.message
                            : undefined,
                    );
                }
            }

            // Chỉ trả metadata công khai; reference lưu trữ nội bộ không đi ra response.
            return toUserDocumentSummary(replaced.document);
        } catch (error) {
            // Bước 5: nếu thay reference thất bại, dọn object mới vì database chưa nhận nó làm file hiện hành.
            try {
                await this.fileStorage.removeUserDocument(newFile);
            } catch (cleanupError) {
                // Cleanup file mới cũng lỗi thì ghi log riêng, không che lỗi writer/transaction ban đầu.
                this.logger.error(
                    `Không dọn được file tạm của tài liệu ${documentId}.`,
                    cleanupError instanceof Error
                        ? cleanupError.stack
                        : undefined,
                );
            }

            // Giữ nguyên lỗi gốc để caller phân biệt conflict, lỗi database và lỗi nghiệp vụ.
            throw error;
        }
    }
}
