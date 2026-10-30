// Contract ghi trạng thái và metadata tài liệu; các thay đổi nhiều bảng phải được adapter transaction.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';

export type NewUserDocumentFile = StoredFileReference;

export type ReplacedUserDocumentFile = {
    document: UserDocumentRecord;
    previousFile: StoredFileReference | null;
};

// Writer không nhận TypeORM entity; application gửi file reference và adapter chuyển sang persistence model.
export interface UserDocumentWriterContract {
    createProvisioningDocument(
        sourceTemplateVersionId: string,
        title: string,
    ): Promise<string>;
    completeDocument(
        documentId: string,
        outputFile: NewUserDocumentFile,
    ): Promise<UserDocumentRecord>;
    replaceDocumentFile(
        documentId: string,
        outputFile: NewUserDocumentFile,
    ): Promise<ReplacedUserDocumentFile>;
    markDocumentFailed(documentId: string, failureCode: string): Promise<void>;
}

export const USER_DOCUMENT_WRITER = Symbol('USER_DOCUMENT_WRITER');
