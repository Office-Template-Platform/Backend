// HTTP endpoint tạo bản DOCX riêng từ một phiên bản mẫu đã xuất bản.
import {
    Body,
    Controller,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';
import { CreateUserDocumentDto } from '@/modules/document-template-library/presentation/dto/create-user-document/create-user-document.dto';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

@ApiTags('Document templates')
@Controller('document-templates')
@UseGuards(AnonymousWorkspaceGuard)
// Controller chuyển template ID và title tùy chọn sang use case tạo tài liệu.
export class CreateUserDocumentController {
    constructor(
        private readonly createUserDocument: CreateUserDocumentService,
    ) {}

    @Post(':templateId/documents')
    @ApiOperation({
        operationId: 'DocumentTemplatesController_create',
        summary: 'Tạo tài liệu DOCX riêng từ mẫu',
    })
    @ApiCreatedResponse({
        description: 'Tài liệu mới đã được tạo và sẵn sàng tải xuống.',
    })
    // File mẫu được giữ bất biến; service tạo bản sao và metadata riêng cho người dùng.
    create(
        @Param('templateId', ParseUUIDPipe) templateId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
        @Body() body: CreateUserDocumentDto,
    ) {
        return this.createUserDocument.execute(
            templateId,
            workspaceId,
            body.title,
        );
    }
}
