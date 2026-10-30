// Port cho use case xóa tài liệu; application nhận reference file chỉ để dọn sau transaction.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';

export type UserDocumentDeletionResult = {
    // Null khi document không có output hoặc output vẫn được tài liệu đang hoạt động khác sử dụng.
    fileToCleanup: StoredFileReference | null;
};

// Adapter phải giới hạn thao tác theo workspace và hoàn tất xóa mềm trước khi trả kết quả.
export interface UserDocumentDeleterContract {
    deleteForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<UserDocumentDeletionResult | null>;
}

export const USER_DOCUMENT_DELETER = Symbol('USER_DOCUMENT_DELETER');
