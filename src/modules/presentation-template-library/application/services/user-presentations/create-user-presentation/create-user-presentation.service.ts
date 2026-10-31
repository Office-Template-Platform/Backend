// Tạo bản PPTX độc lập trong workspace trình duyệt, ghim version nguồn và không sửa asset gốc.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
    type StoredFileReference,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import {
    USER_DOCUMENT_WRITER,
    type UserDocumentWriterContract,
} from '@/modules/user-document-management/application/contracts/user-document-writer.contract';
import type { UserDocumentSummary } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { toUserDocumentSummary } from '@/modules/user-document-management/application/utils/to-user-document-summary';
import { OFFICE_DOCUMENT_FORMATS } from '@/modules/document-file-storage/application/types/office-document-format/office-document-format';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationCreationFailedError } from '@/modules/presentation-template-library/application/errors/presentation-creation-failed.error';
import { PresentationTemplateNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-not-found.error';

@Injectable()
// Tách thao tác database khỏi filesystem: tạo provisioning, copy sang key mới, rồi mới hoàn tất record.
export class CreateUserPresentationService {
    private readonly logger = new Logger(CreateUserPresentationService.name);

    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'findCurrentSource'
        >,
        @Inject(USER_DOCUMENT_WRITER)
        private readonly documentWriter: UserDocumentWriterContract,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    // Ghim version công khai trước khi tạo bản sao; lỗi copy/commit được bù trừ để không sót file hoặc record treo.
    async execute(
        templateId: string,
        workspaceId: string,
        requestedTitle?: string,
    ): Promise<UserDocumentSummary> {
        // Bước 1: reader chỉ trả source của mẫu PRESENTATION published có version hiện hành.
        const source = await this.templateReader.findCurrentSource(templateId);

        if (!source) {
            // Dừng trước mọi thao tác lưu để mẫu private hoặc không tồn tại không tạo record rác.
            throw new PresentationTemplateNotFoundError();
        }

        // Bước 2: chuẩn hóa title; title trống dùng tên mẫu làm tên hiển thị mặc định.
        const title = requestedTitle?.trim() || source.templateName;
        const documentId = await this.documentWriter.createProvisioningDocument(
            source.versionId,
            title,
            workspaceId,
        );
        let outputFile: StoredFileReference | null = null;

        try {
            // Bước 3: sao PPTX sang UUID key riêng; title không được dùng làm đường dẫn vật lý.
            outputFile = await this.fileStorage.copyTemplateFile(
                source.sourceFile,
                `${randomUUID()}.${OFFICE_DOCUMENT_FORMATS.pptx.extension}`,
                `${title}.${OFFICE_DOCUMENT_FORMATS.pptx.extension}`,
            );

            // Bước 4: chỉ public metadata sau khi writer đã lưu file reference và chuyển trạng thái READY.
            const document = await this.documentWriter.completeDocument(
                documentId,
                outputFile,
            );
            return toUserDocumentSummary(document);
        } catch (error) {
            // Bước 5: xóa đúng object mới nếu copy đã thành công; asset mẫu luôn ở namespace bất biến.
            if (outputFile) {
                try {
                    await this.fileStorage.removeUserDocument(outputFile);
                } catch (cleanupError) {
                    // Cleanup lỗi chỉ ghi log, không thay nguyên nhân khiến tạo presentation thất bại.
                    this.logger.error(
                        `Không dọn được file tạm của bản trình chiếu ${documentId}.`,
                        cleanupError instanceof Error
                            ? cleanupError.stack
                            : undefined,
                    );
                }
            }

            // Bước 6: đánh dấu provisioning failed để tài liệu lỗi không nằm mãi ở trạng thái đang tạo.
            try {
                await this.documentWriter.markDocumentFailed(
                    documentId,
                    'PRESENTATION_CREATION_FAILED',
                );
            } catch (stateError) {
                // Giữ lỗi chính; lỗi cập nhật trạng thái được log để có thể xử lý vận hành sau.
                this.logger.error(
                    `Không cập nhật được trạng thái lỗi của bản trình chiếu ${documentId}.`,
                    stateError instanceof Error ? stateError.stack : undefined,
                );
            }

            // Bước 7: chỉ trả lỗi ổn định, không tiết lộ lỗi filesystem hoặc SQL cho client.
            this.logger.error(
                `Không tạo được bản trình chiếu từ mẫu ${templateId}.`,
                error instanceof Error ? error.stack : undefined,
            );
            throw new PresentationCreationFailedError();
        }
    }
}
