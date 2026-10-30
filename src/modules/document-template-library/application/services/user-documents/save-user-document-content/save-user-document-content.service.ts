// Use case thay nội dung tài liệu bằng object mới rồi chỉ xóa file cũ sau khi database commit.
import { Inject, Injectable, Logger } from '@nestjs/common';
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
    type UserDocumentWriterContract,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { toUserDocumentSummary } from '@/modules/document-template-library/application/utils/to-user-document-summary';

@Injectable()
// Điều phối ghi file, transaction thay reference và cleanup; file hiện tại còn dùng được tới khi commit.
export class SaveUserDocumentContentService {
    private readonly logger = new Logger(SaveUserDocumentContentService.name);

    // Reader kiểm tra quyền trạng thái, writer thay reference atomically và storage ghi key mới.
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: UserDocumentReaderContract,
        @Inject(USER_DOCUMENT_WRITER)
        private readonly documentWriter: UserDocumentWriterContract,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    // Chặn trước I/O nếu tài liệu thiếu/không READY; tên file client được chuẩn hóa chỉ để lưu metadata.
    async execute(
        documentId: string,
        content: Buffer,
        uploadedFilename: string,
    ): Promise<UserDocumentSummary> {
        const current =
            await this.documentReader.findUserDocumentById(documentId);

        if (!current) {
            throw new UserDocumentNotFoundError();
        }

        if (current.status !== 'ready' || !current.outputFile) {
            throw new UserDocumentNotReadyError(
                'Chỉ có thể lưu nội dung cho tài liệu đã sẵn sàng.',
            );
        }

        // basename loại bỏ thư mục do client gửi; UUID riêng tạo đường dẫn an toàn, không thể ghi đè file.
        const originalFilename = basename(uploadedFilename.replace(/\\/g, '/'))
            .replace(/[\r\n]/g, '')
            .slice(0, 255);
        const newFile = await this.fileStorage.saveEditedDocument(
            content,
            `${randomUUID()}.docx`,
            originalFilename || 'document.docx',
        );

        try {
            const replaced = await this.documentWriter.replaceDocumentFile(
                documentId,
                newFile,
            );

            // DB đã trỏ sang file mới; lỗi xóa file cũ chỉ tạo orphan có thể dọn sau, không rollback bản mới.
            if (replaced.previousFile) {
                try {
                    await this.fileStorage.removeUserDocument(
                        replaced.previousFile,
                    );
                } catch (cleanupError) {
                    this.logger.warn(
                        `Không dọn được file phiên bản cũ của tài liệu ${documentId}.`,
                        cleanupError instanceof Error
                            ? cleanupError.message
                            : undefined,
                    );
                }
            }

            return toUserDocumentSummary(replaced.document);
        } catch (error) {
            // Nếu transaction thay reference lỗi, xóa file vừa tạo nhưng giữ nguyên lỗi persistence ban đầu.
            try {
                await this.fileStorage.removeUserDocument(newFile);
            } catch (cleanupError) {
                this.logger.error(
                    `Không dọn được file tạm của tài liệu ${documentId}.`,
                    cleanupError instanceof Error
                        ? cleanupError.stack
                        : undefined,
                );
            }

            throw error;
        }
    }
}
