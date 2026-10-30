// HTTP endpoint liệt kê danh mục có mẫu PPTX đã xuất bản.
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPresentationTemplateCategoriesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-template-categories/list-presentation-template-categories.service';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
// Tách endpoint categories để frontend lấy filter độc lập với danh sách mẫu.
export class ListPresentationTemplateCategoriesController {
    constructor(
        private readonly listCategories: ListPresentationTemplateCategoriesService,
    ) {}

    @Get('categories')
    @ApiOperation({
        operationId: 'PresentationTemplatesController_categories',
        summary: 'Liệt kê danh mục mẫu trình chiếu',
    })
    @ApiOkResponse({ description: 'Danh mục và số lượng mẫu PPTX public.' })
    // Reader giới hạn count theo PRESENTATION, published và category active.
    list() {
        return this.listCategories.execute();
    }
}
