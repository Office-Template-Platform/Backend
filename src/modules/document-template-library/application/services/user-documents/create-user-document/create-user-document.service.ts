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

    // Reader ghim current version, writer quản lý transaction, storage chỉ tạo object key mới.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
        @Inject(USER_DOCUMENT_WRITER)
        private readonly documentWriter: UserDocumentWriterContract,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    // Tạo provisioning trước I/O để request dở dang có trạng thái truy vết; title rỗng dùng tên mẫu.
    async execute(
        templateId: string,
        requestedTitle?: string,
    ): Promise<UserDocumentSummary> {
        const source = await this.templateReader.findCurrentSource(templateId);

        if (!source) {
            throw new DocumentTemplateNotFoundError();
        }

        const title = requestedTitle?.trim() || source.templateName;
        const documentId = await this.documentWriter.createProvisioningDocument(
            source.versionId,
            title,
        );
        let outputFile: StoredFileReference | null = null;

        try {
            // UUID làm key độc lập với asset nguồn; tên client chỉ dùng làm metadata tải xuống.
            outputFile = await this.fileStorage.copyTemplateFile(
                source.sourceFile,
                `${randomUUID()}.docx`,
                `${title}.docx`,
            );

            const document = await this.documentWriter.completeDocument(
                documentId,
                outputFile,
            );
            return toUserDocumentSummary(document);
        } catch (error) {
            // Dọn file trước khi đánh dấu failed; lỗi bù trừ chỉ log để không che nguyên nhân ban đầu.
            if (outputFile) {
                try {
                    await this.fileStorage.removeUserDocument(outputFile);
                } catch (cleanupError) {
                    this.logger.error(
                        `Không dọn được file tạm của tài liệu ${documentId}.`,
                        cleanupError instanceof Error
                            ? cleanupError.stack
                            : undefined,
                    );
                }
            }

            try {
                await this.documentWriter.markDocumentFailed(
                    documentId,
                    'DOCUMENT_CREATION_FAILED',
                );
            } catch (stateError) {
                this.logger.error(
                    `Không cập nhật được trạng thái thất bại cho tài liệu ${documentId}.`,
                    stateError instanceof Error ? stateError.stack : undefined,
                );
            }

            this.logger.error(
                `Không tạo được bản DOCX từ mẫu ${templateId}.`,
                error instanceof Error ? error.stack : undefined,
            );
            throw new UserDocumentCreationFailedError();
        }
    }
}
