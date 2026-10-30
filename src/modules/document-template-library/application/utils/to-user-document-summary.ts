// Chỉ xuất metadata công khai; file reference và storage key luôn ở phía server.
import type {
    UserDocumentRecord,
    UserDocumentSummary,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';

// Tạo projection ổn định cho cả response tạo mới, đọc metadata và lưu nội dung.
export function toUserDocumentSummary(
    document: UserDocumentRecord,
): UserDocumentSummary {
    return {
        id: document.id,
        title: document.title,
        status: document.status,
        failureCode: document.failureCode,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        downloadUrl: document.downloadUrl,
        sourceTemplate: document.sourceTemplate,
    };
}
