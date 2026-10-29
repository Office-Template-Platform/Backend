// Application service điều phối việc đọc danh mục mẫu văn bản.
// Hợp đồng hiện trả metadata; nguồn dữ liệu và file DOCX thuộc infrastructure.
import { Injectable } from '@nestjs/common';
import type { DocumentTemplateSummary } from
    '@/modules/document-template-library/application/types/document-template-summary';

// Service giữ use case ở application; không gọi file system hay database trực tiếp.
@Injectable()
export class ListDocumentTemplatesService {
    // Trả danh sách rỗng cho tới khi repository và bộ mẫu DOCX được triển khai.
    execute(): DocumentTemplateSummary[] {
        return [];
    }
}
