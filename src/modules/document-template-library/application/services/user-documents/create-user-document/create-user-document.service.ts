// Use case tạo bản DOCX độc lập từ current version, không bao giờ ghi lên asset mẫu.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
    type StoredFileReference,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import {
    DOCUMENT_TEMPLATE_READER,
    type DocumentTemplateReaderContract,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import {
    USER_DOCUMENT_WRITER,
    type UserDocumentWriterContract,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import type { UserDocumentSummary } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { DocumentTemplateNotFoundError } from '@/modules/document-template-library/application/errors/document-template-not-found.error';
import { UserDocumentCreationFailedError } from '@/modules/document-template-library/application/errors/user-document-creation-failed.error';
import { toUserDocumentSummary } from '@/modules/document-template-library/application/utils/to-user-document-summary';

@Injectable()
// Điều phối trạng thái DB và file system; lỗi sau khi tạo provisioning được bù trừ trước khi trả lỗi.
export class CreateUserDocumentService {
    private readonly logger = new Logger(CreateUserDocumentService.name);

    // Reader chỉ trả nguồn mẫu đã xuất bản và phiên bản hiện hành; writer sở hữu trạng thái cùng transaction DB.
    // Storage chỉ sao file nguồn sang object mới; service không truy cập TypeORM hoặc tự quản lý đường dẫn lưu.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
        @Inject(USER_DOCUMENT_WRITER)
        private readonly documentWriter: UserDocumentWriterContract,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    // Luồng chỉ tạo bản sao từ phiên bản nguồn mà reader xác nhận còn công khai và hiện hành.
    // Bản ghi provisioning được tạo trước thao tác file để tài liệu có trạng thái truy vết và workspace owner.
    // Sau khi sao file riêng, writer gắn file vào bản ghi; lỗi ở giai đoạn này được bù trừ trước khi trả lỗi ổn định.
    // Lỗi đọc nguồn hoặc tạo provisioning xảy ra trước khối try nên được giữ nguyên, không giả thành lỗi sao file.
    async execute(
        templateId: string,
        workspaceId: string,
        requestedTitle?: string,
    ): Promise<UserDocumentSummary> {
        // Bước 1: lấy source file cùng version hiện hành; reader trả null nếu mẫu không còn public hoặc không tồn tại.
        const source = await this.templateReader.findCurrentSource(templateId);

        if (!source) {
            // Dừng trước khi tạo DB record hoặc gọi storage để không để lại provisioning record mồ côi.
            throw new DocumentTemplateNotFoundError();
        }

        // Bước 2: trim title do client gửi; chuỗi rỗng sau chuẩn hóa dùng tên mẫu làm mặc định.
        const title = requestedTitle?.trim() || source.templateName;

        // Bước 3: tạo record trong đúng workspace và ghim version đã đọc để thay đổi mẫu không ảnh hưởng bản sao.
        const documentId = await this.documentWriter.createProvisioningDocument(
            source.versionId,
            title,
            workspaceId,
        );
        // Chỉ có reference sau khi copy thành công; cleanup dùng nó để xác định đúng object cần xóa.
        let outputFile: StoredFileReference | null = null;

        try {
            // Bước 4: sao chép sang UUID key riêng để chỉnh sửa không tác động asset mẫu.
            // Title chỉ làm tên hiển thị/tải xuống; dữ liệu client không được dùng làm storage key.
            outputFile = await this.fileStorage.copyTemplateFile(
                source.sourceFile,
                `${randomUUID()}.docx`,
                `${title}.docx`,
            );

            // Bước 5: chỉ chuyển provisioning sang READY khi đã có output file; summary ẩn reference nội bộ.
            const document = await this.documentWriter.completeDocument(
                documentId,
                outputFile,
            );
            return toUserDocumentSummary(document);
        } catch (error) {
            // Bước 6: nếu copy đã trả reference, xóa đúng object mới và không đụng tới file nguồn của mẫu.
            if (outputFile) {
                try {
                    await this.fileStorage.removeUserDocument(outputFile);
                } catch (cleanupError) {
                    // Cleanup lỗi chỉ được ghi log; vẫn tiếp tục đánh dấu FAILED và giữ nguyên lỗi tạo ban đầu.
                    this.logger.error(
                        `Không dọn được file tạm của tài liệu ${documentId}.`,
                        cleanupError instanceof Error
                            ? cleanupError.stack
                            : undefined,
                    );
                }
            }

            // Bước 7: luôn thử đánh dấu FAILED sau cleanup để record không nằm mãi ở trạng thái provisioning.
            try {
                await this.documentWriter.markDocumentFailed(
                    documentId,
                    'DOCUMENT_CREATION_FAILED',
                );
            } catch (stateError) {
                // Nếu DB cũng không cập nhật được, log lỗi bù trừ nhưng không thay thế lỗi chính.
                this.logger.error(
                    `Không cập nhật được trạng thái thất bại cho tài liệu ${documentId}.`,
                    stateError instanceof Error ? stateError.stack : undefined,
                );
            }

            // Bước 8: log nguyên nhân nội bộ để vận hành chẩn đoán, nhưng chỉ trả lỗi ổn định ra API.
            this.logger.error(
                `Không tạo được bản DOCX từ mẫu ${templateId}.`,
                error instanceof Error ? error.stack : undefined,
            );
            throw new UserDocumentCreationFailedError();
        }
    }
}
