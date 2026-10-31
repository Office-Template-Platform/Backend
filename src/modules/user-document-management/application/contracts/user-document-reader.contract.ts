// Contract đọc metadata tài liệu người dùng; output file nội bộ chỉ được dùng ở server boundary.
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';

export type UserDocumentListQuery = {
    page: number;
    limit: number;
    search?: string;
};

export type UserDocumentRecord = {
    id: string;
    title: string;
    status: 'provisioning' | 'ready' | 'failed';
    failureCode: string | null;
    createdAt: string;
    updatedAt: string;
    downloadUrl: string | null;
    outputFile: StoredFileReference | null;
    sourceTemplate: {
        id: string;
        name: string;
        version: number;
    };
};

export type UserDocumentSummary = Omit<UserDocumentRecord, 'outputFile'>;

// Reader nạp source-template snapshot và output reference để giữ metadata sau khi mẫu bị archive.
export interface UserDocumentReaderContract {
    findUserDocumentById(id: string): Promise<UserDocumentRecord | null>;
    findUserDocumentByIdForWorkspace(
        id: string,
        workspaceId: string,
    ): Promise<UserDocumentRecord | null>;
    findDeletedUserDocumentByIdForWorkspace(
        id: string,
        workspaceId: string,
    ): Promise<UserDocumentRecord | null>;
    listUserDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
    ): Promise<{ items: UserDocumentRecord[]; total: number }>;
    listDeletedUserDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
    ): Promise<{ items: UserDocumentRecord[]; total: number }>;
}

export const USER_DOCUMENT_READER = Symbol('USER_DOCUMENT_READER');
