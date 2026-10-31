// Contract file storage của feature; application chỉ nhận metadata và stream, không biết filesystem.
import type { Readable } from 'node:stream';

export type StoredFileReference = {
    provider: 'local' | 's3';
    storageNamespace: string;
    objectKey: string;
    originalFilename: string | null;
    mimeType: string;
    sizeBytes: string;
    sha256: string | null;
};

// Adapter phải ghi file mới trước khi application đổi database reference sang key mới.
export interface DocumentFileStorageContract {
    copyTemplateFile(
        source: StoredFileReference,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference>;
    saveEditedDocument(
        content: Buffer,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference>;
    openReadStream(file: StoredFileReference): Promise<Readable>;
    removeUserDocument(file: StoredFileReference): Promise<void>;
}

export const DOCUMENT_FILE_STORAGE = Symbol('DOCUMENT_FILE_STORAGE');
