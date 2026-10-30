// Use case xóa tài liệu trong workspace hiện tại và điều phối dọn file sau khi database đã commit.
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import {
    USER_DOCUMENT_DELETER,
    type UserDocumentDeleterContract,
} from '@/modules/document-template-library/application/contracts/user-document-deleter.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';

@Injectable()
// Use case không nhận owner từ client; transaction writer xác minh ID và workspace trước khi xóa mềm.
export class DeleteUserDocumentService {
    private readonly logger = new Logger(DeleteUserDocumentService.name);

    // Deleter commit trạng thái xóa trước; storage chỉ được gọi với reference còn an toàn để cleanup.
    constructor(
        @Inject(USER_DOCUMENT_DELETER)
        private readonly documentDeleter: Pick<
            UserDocumentDeleterContract,
            'deleteForWorkspace'
        >,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: Pick<
            DocumentFileStorageContract,
            'removeUserDocument'
        >,
    ) {}

    // Xóa mềm theo workspace để ID thiếu và ID thuộc workspace khác luôn trả cùng lỗi 404.
    // File vật lý chỉ được xóa sau commit; lỗi cleanup được ghi log nhưng không báo thất bại giả cho thao tác đã hoàn tất.
    async execute(documentId: string, workspaceId: string): Promise<void> {
        // Bước 1: transaction khóa và xóa đúng document của workspace, đồng thời trả file đủ điều kiện cleanup.
        const deletion = await this.documentDeleter.deleteForWorkspace(
            documentId,
            workspaceId,
        );

        if (!deletion) {
            // Không tiết lộ document có tồn tại ở một workspace khác hay đã bị xóa trước đó.
            throw new UserDocumentNotFoundError();
        }

        // Bước 2: chỉ dọn object khi repository xác nhận không còn document đang hoạt động tham chiếu nó.
        if (!deletion.fileToCleanup) {
            return;
        }

        try {
            await this.fileStorage.removeUserDocument(deletion.fileToCleanup);
        } catch (cleanupError) {
            // Database đã commit; giữ response thành công để client không retry một thao tác đã xóa.
            this.logger.warn(
                `Không dọn được file của tài liệu ${documentId} sau khi xóa.`,
                cleanupError instanceof Error
                    ? cleanupError.message
                    : undefined,
            );
        }
    }
}
