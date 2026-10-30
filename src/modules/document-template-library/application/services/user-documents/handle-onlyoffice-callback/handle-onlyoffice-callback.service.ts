// Xử lý callback đã ký và lưu file DOCX/PPTX cuối về bản riêng của người dùng.
import { createHash } from 'node:crypto';
import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    PayloadTooLargeException,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import type { OnlyOfficeCallbackPayload } from '@/integrations/onlyoffice/types/onlyoffice-docs.types';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { UserDocumentRevisionConflictError } from '@/modules/document-template-library/application/errors/user-document-revision-conflict.error';
import { SaveUserDocumentContentService } from '@/modules/document-template-library/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import { getOfficeDocumentFormat } from '@/modules/document-template-library/application/types/office-document-format/office-document-format';

const MAX_EDITED_OFFICE_FILE_SIZE = 25 * 1024 * 1024;
const OFFICE_ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

@Injectable()
// Chỉ lưu status 2; ACK trạng thái không đổi nội dung, còn callback lỗi hoặc sai contract bị từ chối.
export class HandleOnlyOfficeCallbackService {
    private readonly logger = new Logger(HandleOnlyOfficeCallbackService.name);

    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findUserDocumentById'
        >,
        private readonly onlyOfficeDocs: OnlyOfficeDocsService,
        private readonly saveDocumentContent: SaveUserDocumentContentService,
    ) {}

    // Xác minh JWT và contract callback trước khi đọc database hoặc tải file.
    // Chỉ status 2 của tài liệu READY và đúng editor key mới được tiếp tục lưu.
    // File phải đúng origin, dưới giới hạn dung lượng và có cấu trúc Office khớp định dạng nguồn.
    // Ghi theo revision hiện tại; callback cũ được ACK, còn lỗi khác được trả về.
    async execute(
        documentId: string,
        authorizationHeader: string | undefined,
        payload: OnlyOfficeCallbackPayload,
    ): Promise<void> {
        // Bước 1: chỉ tiếp tục khi Bearer JWT hợp lệ và các trường quan trọng khớp payload đã ký.
        await this.onlyOfficeDocs.verifyCallback(authorizationHeader, payload);

        // Bước 2: status và key là dữ liệu tối thiểu để quyết định callback có thể được xử lý an toàn.
        if (!Number.isInteger(payload.status) || !payload.key) {
            throw new BadRequestException(
                'Callback ONLYOFFICE thiếu trạng thái hoặc key.',
            );
        }

        // Bước 3: ACK trạng thái chưa có bản cuối để Document Server không retry.
        if (
            payload.status === 1 ||
            payload.status === 4 ||
            payload.status === 6
        ) {
            return;
        }

        // Bước 3a: báo lỗi khi ONLYOFFICE thất bại, không ACK nhầm là đã lưu thành công.
        if (payload.status === 3 || payload.status === 7) {
            this.logger.error(
                `ONLYOFFICE báo lỗi lưu tài liệu ${documentId} với status ${payload.status}.`,
            );
            throw new BadRequestException(
                'ONLYOFFICE không lưu được tài liệu.',
            );
        }

        // Bước 3b: chỉ status 2 có file cuối; thiếu URL hoặc status ngoài contract thì dừng trước khi tải.
        if (payload.status !== 2 || !payload.url) {
            throw new BadRequestException(
                'Callback lưu cuối không có URL file.',
            );
        }

        // Bước 4: tìm tài liệu theo ID, rồi phân biệt 404 với tài liệu chưa READY.
        const document =
            await this.documentReader.findUserDocumentById(documentId);
        if (!document) {
            throw new UserDocumentNotFoundError();
        }

        if (document.status !== 'ready' || !document.outputFile) {
            throw new UserDocumentNotReadyError();
        }

        // Bước 5: so key callback với object hiện hành; key cũ được ACK mà không tải hoặc ghi đè file mới.
        const expectedKey = createEditorKey(
            document.id,
            document.outputFile.storageNamespace,
            document.outputFile.objectKey,
        );
        if (payload.key !== expectedKey) {
            // Callback hợp lệ nhưng đã thuộc revision cũ; ACK để không retry và không ghi đè file mới.
            this.logger.warn(`Bỏ qua callback cũ của tài liệu ${documentId}.`);
            return;
        }

        // Bước 6: định dạng callback phải khớp file đang sửa; trường vắng mặt vẫn được phép theo contract.
        const fileFormat = getOfficeDocumentFormat(
            document.outputFile.mimeType,
        );
        if (!fileFormat) {
            throw new UnsupportedMediaTypeException(
                'File đang sửa không thuộc định dạng DOCX/PPTX được hỗ trợ.',
            );
        }
        if (
            payload.filetype &&
            payload.filetype.toLowerCase() !== fileFormat.extension
        ) {
            throw new UnsupportedMediaTypeException(
                'ONLYOFFICE trả về định dạng khác với file đang sửa.',
            );
        }

        // Bước 7: adapter tải từ origin đã cấu hình và tự giới hạn timeout cùng dung lượng.
        const content = await this.onlyOfficeDocs.downloadEditedDocument(
            payload.url,
        );
        // Kiểm tra chữ ký ZIP và part OOXML trước khi ghi object mới vào storage.
        this.assertValidOfficeDocument(content, fileFormat.extension);

        try {
            // Bước 8: truyền file reference hiện tại để writer khóa row và chặn callback ghi đè đồng thời.
            await this.saveDocumentContent.executeFromOnlyOfficeCallback(
                documentId,
                content,
                `${document.title}.${fileFormat.extension}`,
                {
                    storageNamespace: document.outputFile.storageNamespace,
                    objectKey: document.outputFile.objectKey,
                },
            );
        } catch (error) {
            // Bước 9: conflict cho biết revision đã đổi; ACK để không retry callback cũ.
            if (error instanceof UserDocumentRevisionConflictError) {
                this.logger.warn(
                    `Bỏ qua callback đồng thời của tài liệu ${documentId}.`,
                );
                return;
            }

            // Lỗi khác được ném lại để không ACK nhầm một lần lưu đã thất bại.
            throw error;
        }
    }

    // Chặn file quá lớn và xác nhận package có các thành phần cốt lõi của đúng định dạng.
    private assertValidOfficeDocument(
        content: Buffer,
        extension: 'docx' | 'pptx',
    ): void {
        if (content.byteLength > MAX_EDITED_OFFICE_FILE_SIZE) {
            throw new PayloadTooLargeException(
                'File sau chỉnh sửa vượt quá 25 MB.',
            );
        }

        const requiredPackagePart =
            extension === 'pptx' ? 'ppt/presentation.xml' : 'word/document.xml';
        if (
            !content.subarray(0, 4).equals(OFFICE_ZIP_HEADER) ||
            !content.includes(Buffer.from('[Content_Types].xml')) ||
            !content.includes(Buffer.from(requiredPackagePart))
        ) {
            throw new UnsupportedMediaTypeException(
                'ONLYOFFICE trả về file Office không hợp lệ.',
            );
        }
    }
}

// Cùng object key luôn sinh một editor key; phiên bản mới sau lưu sẽ có key khác.
function createEditorKey(
    documentId: string,
    storageNamespace: string,
    objectKey: string,
): string {
    return createHash('sha256')
        .update(`${documentId}:${storageNamespace}:${objectKey}`)
        .digest('hex');
}
