// Chuyển persistence metadata của StoredFile sang contract trung lập mà các feature Office dùng.
import { FileStorageProvider } from '@/database/enums/office-template.enums';
import { StoredFile } from '@/database/entities/stored-file.entity';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';

// Không trả entity TypeORM ra ngoài infrastructure; mọi luồng chỉ nhận metadata cần thiết để đọc file.
export function toStoredFileReference(file: StoredFile): StoredFileReference {
    return {
        provider: file.provider === FileStorageProvider.LOCAL ? 'local' : 's3',
        storageNamespace: file.storageNamespace,
        objectKey: file.objectKey,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
    };
}
