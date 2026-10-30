// HTTP endpoint lấy metadata chi tiết và danh sách slide preview của một mẫu PPTX.
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetPresentationTemplateService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template/get-presentation-template.service';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
// Controller xác thực UUID tại HTTP boundary rồi giao visibility check cho use case/reader.
export class GetPresentationTemplateController {
    constructor(private readonly getTemplate: GetPresentationTemplateService) {}

    @Get(':templateId')
    @ApiOperation({
        operationId: 'PresentationTemplatesController_get',
        summary: 'Xem chi tiết mẫu trình chiếu',
    })
    @ApiOkResponse({ description: 'Metadata và các slide preview hiện có.' })
    // Không trả binary hoặc storage key trong JSON detail.
    get(@Param('templateId', ParseUUIDPipe) templateId: string) {
        return this.getTemplate.execute(templateId);
    }
}
