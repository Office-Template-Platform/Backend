// HTTP endpoint liệt kê catalog PPTX cho trang mẫu trình chiếu.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPresentationTemplatesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-templates/list-presentation-templates.service';
import { ListPresentationTemplatesQueryDto } from '@/modules/presentation-template-library/presentation/dto/list-presentation-templates-query/list-presentation-templates-query.dto';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
// Endpoint giữ response dạng mảng để tương thích catalog frontend hiện tại.
export class ListPresentationTemplatesController {
    constructor(
        private readonly listTemplates: ListPresentationTemplatesService,
    ) {}

    @Get()
    @ApiOperation({
        operationId: 'PresentationTemplatesController_list',
        summary: 'Tìm kiếm và lọc mẫu trình chiếu',
    })
    @ApiOkResponse({ description: 'Danh sách mẫu PPTX đã xuất bản.' })
    // Query DTO chỉ chứa filter đã validate; service và reader không nhận raw request object.
    list(@Query() query: ListPresentationTemplatesQueryDto) {
        return this.listTemplates.execute(query);
    }
}
