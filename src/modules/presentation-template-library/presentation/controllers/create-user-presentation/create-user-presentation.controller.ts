// HTTP endpoint tạo bản PPTX riêng trong workspace của trình duyệt hiện tại.
import {
    Body,
    Controller,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserPresentationService } from '@/modules/presentation-template-library/application/services/user-presentations/create-user-presentation/create-user-presentation.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/user-document-management/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';
import { CreateUserPresentationDto } from '@/modules/presentation-template-library/presentation/dto/create-user-presentation/create-user-presentation.dto';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
@UseGuards(AnonymousWorkspaceGuard)
// Workspace guard ràng buộc bản sao với trình duyệt đã tạo, giống luồng tài liệu DOCX.
export class CreateUserPresentationController {
    constructor(
        private readonly createPresentation: CreateUserPresentationService,
    ) {}

    @Post(':templateId/documents')
    @ApiOperation({
        operationId: 'PresentationTemplatesController_create',
        summary: 'Tạo bản PPTX riêng từ mẫu',
    })
    @ApiCreatedResponse({
        description: 'Bản trình chiếu đã được tạo và sẵn sàng tải xuống.',
    })
    // Template nguồn không bị sửa; service gắn version nguồn vào UserDocument độc lập.
    create(
        @Param('templateId', ParseUUIDPipe) templateId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
        @Body() body: CreateUserPresentationDto,
    ) {
        return this.createPresentation.execute(
            templateId,
            workspaceId,
            body.title,
        );
    }
}
