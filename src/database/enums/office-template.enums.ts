// Dùng để xác định loại sản phẩm của mẫu, có thể là tài liệu hoặc bản trình chiếu.
export enum OfficeTemplateProductType {
    DOCUMENT = 'document',
    PRESENTATION = 'presentation',
}

// Dùng để xác định trạng thái của mẫu, từ khi tạo đến khi xuất bản hoặc lưu trữ.
export enum OfficeTemplateStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
    ARCHIVED = 'archived',
}

// Dùng để xác định lưu trữ file, có thể là local hoặc S3.
export enum FileStorageProvider {
    LOCAL = 'local',
    S3 = 's3',
}

// Dùng để xác định trạng thái của tài liệu người dùng, từ khi tạo đến khi kết xuất xong.
export enum UserDocumentStatus {
    PROVISIONING = 'provisioning',
    READY = 'ready',
    FAILED = 'failed',
}
