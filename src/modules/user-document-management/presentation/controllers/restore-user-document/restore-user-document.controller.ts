// HTTP endpoint đưa tài liệu từ thùng rác trở lại danh sách của workspace hiện tại.
import {
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    UseGuards,
} from '@nestjs/common';
import {
    ApiConflictResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { RestoreUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/restore-user-document/restore-user-document.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/user-document-management/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Guard lấy owner từ cookie để client không thể khôi phục tài liệu của workspace khác.
export class RestoreUserDocumentController {
    constructor(
        private readonly restoreUserDocument: RestoreUserDocumentService,
    ) {}

    @Patch(':documentId/restore')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        operationId: 'UserDocumentsController_restore',
        summary: 'Khôi phục tài liệu đã xóa mềm',
    })
    @ApiNoContentResponse({
        description:
            'Tài liệu được đưa trở lại danh sách tài liệu đang hoạt động.',
    })
    @ApiNotFoundResponse({
        description:
            'Không tìm thấy tài liệu trong thùng rác của workspace hiện tại.',
    })
    @ApiConflictResponse({
        description:
            'File đầu ra không còn trên storage nên không thể khôi phục.',
    })
    // UUID được kiểm tra tại HTTP boundary; use case dùng chung 404 cho sai owner và trạng thái không hợp lệ.
    async restore(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ): Promise<void> {
        // 204 không có body; file và metadata vốn được giữ nguyên từ lúc xóa.
        await this.restoreUserDocument.execute(documentId, workspaceId);
    }
}
