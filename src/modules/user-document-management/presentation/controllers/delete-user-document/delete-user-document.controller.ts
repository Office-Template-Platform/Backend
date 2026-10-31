// HTTP endpoint đưa một tài liệu vào thùng rác của workspace hiện tại.
import {
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    UseGuards,
} from '@nestjs/common';
import {
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { DeleteUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/delete-user-document/delete-user-document.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/user-document-management/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Guard xác định owner từ cookie; controller không nhận workspace ID do client tự truyền.
export class DeleteUserDocumentController {
    constructor(
        private readonly deleteUserDocument: DeleteUserDocumentService,
    ) {}

    @Delete(':documentId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        operationId: 'UserDocumentsController_delete',
        summary: 'Đưa tài liệu vào thùng rác',
    })
    @ApiNoContentResponse({
        description:
            'Tài liệu đã được xóa mềm; file đầu ra được giữ để có thể khôi phục.',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy tài liệu trong workspace hiện tại.',
    })
    // UUID được kiểm tra ở HTTP boundary; lỗi không tồn tại và sai owner cùng trả 404 từ service.
    async remove(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ): Promise<void> {
        // 204 không có body; use case chỉ cập nhật deleted_at và không gọi file storage.
        await this.deleteUserDocument.execute(documentId, workspaceId);
    }
}
