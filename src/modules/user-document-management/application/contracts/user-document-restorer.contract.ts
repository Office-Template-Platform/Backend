// Port khôi phục tài liệu đã xóa mềm trong đúng workspace sở hữu.
export interface UserDocumentRestorerContract {
    restoreForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<boolean>;
}

export const USER_DOCUMENT_RESTORER = Symbol('USER_DOCUMENT_RESTORER');
