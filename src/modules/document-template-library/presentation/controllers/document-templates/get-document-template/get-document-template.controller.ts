// HTTP endpoint trả metadata và phiên bản hiện hành của một mẫu DOCX.
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';

@ApiTags('Document templates')
@Controller('document-templates')
// Controller xác thực UUID ở biên HTTP rồi giao truy vấn cho use case.
export class GetDocumentTemplateController {
    constructor(private readonly getTemplate: GetDocumentTemplateService) {}

    @Get(':templateId')
    @ApiOperation({
        operationId: 'DocumentTemplatesController_detail',
        summary: 'Xem chi tiết một mẫu văn bản',
    })
    @ApiOkResponse({
        description: 'Metadata và phiên bản hiện hành của mẫu.',
    })
    // ParseUUIDPipe từ chối ID sai định dạng trước khi gọi application.
    get(@Param('templateId', ParseUUIDPipe) templateId: string) {
        return this.getTemplate.execute(templateId);
    }
}
