// Mapper persistence của feature; TypeORM entity dừng tại infrastructure boundary.
import {
    FileStorageProvider,
    UserDocumentStatus,
} from '@/database/enums/office-template.enums';
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';

// Chuyển provider và metadata persistence sang contract file mà application hiểu.
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

// Chỉ map metadata đã được nạp; link tải chỉ có khi bản ghi READY có file đầu ra.
export function toUserDocumentRecord(
    document: UserDocument,
): UserDocumentRecord {
    return {
        id: document.id,
        title: document.title,
        status: document.status,
        failureCode: document.failureCode,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
        downloadUrl:
            document.status === UserDocumentStatus.READY &&
            document.outputFileId
                ? `/api/user-documents/${document.id}/download`
                : null,
        outputFile: document.outputFile
            ? toStoredFileReference(document.outputFile)
            : null,
        sourceTemplate: {
            id: document.sourceTemplateVersion.templateId,
            // Template có thể đã soft-delete; snapshot version vẫn cho phép đọc tài liệu đã tạo.
            name:
                document.sourceTemplateVersion.template?.name ??
                'Mẫu đã lưu trữ',
            version: document.sourceTemplateVersion.versionNumber,
        },
    };
}
