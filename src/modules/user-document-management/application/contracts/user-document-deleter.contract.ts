// Port giới hạn thao tác xóa mềm theo workspace; không nhận hoặc xóa file vật lý.
export interface UserDocumentDeleterContract {
    deleteForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<boolean>;
}

export const USER_DOCUMENT_DELETER = Symbol('USER_DOCUMENT_DELETER');
