// Use case đánh dấu tài liệu đã xóa trong workspace, đồng thời giữ nguyên file để hỗ trợ khôi phục.
import { Inject, Injectable } from '@nestjs/common';
import {
    USER_DOCUMENT_DELETER,
    type UserDocumentDeleterContract,
} from '@/modules/user-document-management/application/contracts/user-document-deleter.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';

@Injectable()
// Use case không nhận owner từ client; transaction writer xác minh ID và workspace trước khi xóa mềm.
export class DeleteUserDocumentService {
    // Repository chỉ thay đổi deleted_at; metadata file và object vật lý được giữ nguyên.
    constructor(
        @Inject(USER_DOCUMENT_DELETER)
        private readonly documentDeleter: UserDocumentDeleterContract,
    ) {}

    // Xóa mềm theo workspace để ID thiếu, đã xóa và ID thuộc workspace khác cùng trả 404.
    // File và StoredFile metadata không bị đụng tới, nhờ vậy tài liệu còn đủ dữ liệu để khôi phục.
    async execute(documentId: string, workspaceId: string): Promise<void> {
        // Bước 1: adapter kiểm tra owner và chỉ cập nhật deleted_at trong transaction.
        const deleted = await this.documentDeleter.deleteForWorkspace(
            documentId,
            workspaceId,
        );

        if (!deleted) {
            // Không tiết lộ document thuộc workspace khác hay đã bị xóa trước đó.
            throw new UserDocumentNotFoundError();
        }
    }
}
