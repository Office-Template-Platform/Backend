// Mapper persistence của feature; TypeORM entity dừng tại infrastructure boundary.
import { UserDocumentStatus } from '@/database/enums/office-template.enums';
import type { UserDocumentRecord } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { UserDocument } from '@/database/entities/user-document.entity';
import { toStoredFileReference } from '@/modules/document-file-storage/infrastructure/mappers/stored-file-reference.mapper';

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
