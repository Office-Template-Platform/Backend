// HTTP endpoint liệt kê danh mục và số mẫu DOCX đang được xuất bản.
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';

@ApiTags('Document templates')
@Controller('document-templates')
// Controller tách bộ lọc danh mục khỏi endpoint liệt kê mẫu.
export class ListDocumentTemplateCategoriesController {
    constructor(
        private readonly listCategories: ListDocumentTemplateCategoriesService,
    ) {}

    @Get('categories')
    @ApiOperation({
        operationId: 'DocumentTemplatesController_categories',
        summary: 'Liệt kê danh mục mẫu văn bản',
    })
    @ApiOkResponse({
        description: 'Danh mục đang hoạt động và số mẫu tương ứng.',
    })
    // Frontend có thể tải danh mục độc lập với danh sách mẫu đã phân trang.
    list() {
        return this.listCategories.execute();
    }
}
