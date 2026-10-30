// Application service điều phối việc đọc danh mục bộ mẫu trình chiếu.
// Hợp đồng hiện trả metadata; nguồn dữ liệu và file PPTX thuộc infrastructure.
import { Injectable } from '@nestjs/common';
import type { PresentationTemplateSummary } from '@/modules/presentation-template-library/application/types/presentation-template-summary';

// Service giữ use case ở application; không gọi file system hay database trực tiếp.
@Injectable()
export class ListPresentationTemplatesService {
    // Trả danh sách rỗng cho tới khi repository và bộ mẫu PPTX được triển khai.
    execute(): PresentationTemplateSummary[] {
        return [];
    }
}
