// HTTP endpoint liệt kê, tìm kiếm và phân trang mẫu DOCX.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { ListDocumentTemplatesQueryDto } from '@/modules/document-template-library/presentation/dto/list-document-templates-query/list-document-templates-query.dto';

@ApiTags('Document templates')
@Controller('document-templates')
// Controller chỉ chuyển query đã validate sang use case catalog.
export class ListDocumentTemplatesController {
    constructor(private readonly listTemplates: ListDocumentTemplatesService) {}

    @Get()
    @ApiOperation({
        operationId: 'DocumentTemplatesController_list',
        summary: 'Tìm kiếm và phân trang mẫu văn bản',
    })
    @ApiOkResponse({ description: 'Danh sách mẫu DOCX đã xuất bản.' })
    // ValidationPipe chuyển đổi và giới hạn query trước khi use case truy vấn catalog.
    list(@Query() query: ListDocumentTemplatesQueryDto) {
        return this.listTemplates.execute(query);
    }
}
