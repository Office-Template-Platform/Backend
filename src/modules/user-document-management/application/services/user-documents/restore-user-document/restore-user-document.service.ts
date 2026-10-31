// Use case xác minh dữ liệu đầu ra rồi khôi phục dấu deleted_at mà không tạo lại file hay metadata.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/user-document-management/application/errors/user-document-not-ready.error';
import {
    USER_DOCUMENT_RESTORER,
    type UserDocumentRestorerContract,
} from '@/modules/user-document-management/application/contracts/user-document-restorer.contract';

@Injectable()
// Ranh giới application chỉ nhận ID và workspace đã xác thực, không truy cập TypeORM trực tiếp.
export class RestoreUserDocumentService {
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findDeletedUserDocumentByIdForWorkspace'
        >,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: Pick<
            DocumentFileStorageContract,
            'openReadStream'
        >,
        @Inject(USER_DOCUMENT_RESTORER)
        private readonly documentRestorer: UserDocumentRestorerContract,
    ) {}

    // Khôi phục đúng tài liệu trong thùng rác; file đầu ra thiếu được báo 409 để không bật lại dữ liệu hỏng.
    async execute(documentId: string, workspaceId: string): Promise<void> {
        // Bước 1: reader chỉ trả hàng đã xóa trong workspace này; ID thiếu, sai owner hoặc đang hoạt động đều là 404.
        const deletedDocument =
            await this.documentReader.findDeletedUserDocumentByIdForWorkspace(
                documentId,
                workspaceId,
            );

        if (!deletedDocument) {
            throw new UserDocumentNotFoundError();
        }

        // Bước 2: kiểm tra file vật lý trước khi đổi deleted_at, phòng trường hợp dữ liệu cũ đã mất file.
        if (deletedDocument.outputFile) {
            try {
                const fileStream = await this.fileStorage.openReadStream(
                    deletedDocument.outputFile,
                );
                fileStream.destroy();
            } catch (error) {
                if (error instanceof NotFoundException) {
                    // Bản ghi vẫn còn nhưng nội dung không còn trên storage; không khôi phục thành tài liệu lỗi.
                    throw new UserDocumentNotReadyError(
                        'Không thể khôi phục vì file đầu ra không còn trên máy chủ.',
                    );
                }

                // Lỗi storage khác 404 là sự cố hạ tầng; giữ nguyên để caller có thể xử lý đúng.
                throw error;
            }
        }

        // Bước 3: repository khóa lại hàng và xác minh owner/trạng thái lần nữa trước khi gỡ dấu xóa.
        const restored = await this.documentRestorer.restoreForWorkspace(
            documentId,
            workspaceId,
        );

        if (!restored) {
            // Trạng thái có thể đổi giữa bước đọc/file check và transaction; không báo thành công khi race thua.
            throw new UserDocumentNotFoundError();
        }
    }
}
