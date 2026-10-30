// Use case đọc danh mục đang có ít nhất một bộ mẫu trình chiếu đã xuất bản.
import { Inject, Injectable } from '@nestjs/common';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';

@Injectable()
// Không tự truy vấn hoặc đếm mẫu; adapter trả category count đã giới hạn theo product type.
export class ListPresentationTemplateCategoriesService {
    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'listCategories'
        >,
    ) {}

    // Giữ nguyên kết quả reader để API categories dùng cùng read model với catalog.
    execute() {
        return this.templateReader.listCategories();
    }
}
