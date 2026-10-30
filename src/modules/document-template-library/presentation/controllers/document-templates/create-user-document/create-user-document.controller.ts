// HTTP endpoint tạo bản DOCX riêng từ một phiên bản mẫu đã xuất bản.
import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';
import { CreateUserDocumentDto } from '@/modules/document-template-library/presentation/dto/create-user-document/create-user-document.dto';

@ApiTags('Document templates')
@Controller('document-templates')
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
        @Body() body: CreateUserDocumentDto,
    ) {
        return this.createUserDocument.execute(templateId, body.title);
    }
}
