// HTTP endpoint trả trạng thái và metadata của một tài liệu DOCX người dùng.
import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/get-user-document/get-user-document.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Controller xác thực ID rồi chuyển quyền đọc metadata cho use case.
export class GetUserDocumentController {
    constructor(private readonly getUserDocument: GetUserDocumentService) {}

    @Get(':documentId')
    @ApiOperation({
        operationId: 'UserDocumentsController_detail',
        summary: 'Xem metadata tài liệu đã tạo',
    })
    @ApiOkResponse({
        description: 'Trạng thái, mẫu nguồn và URL tải tài liệu.',
    })
    // UUID sai định dạng bị từ chối trước khi truy vấn tài liệu.
    detail(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ) {
        return this.getUserDocument.execute(documentId, workspaceId);
    }
}
