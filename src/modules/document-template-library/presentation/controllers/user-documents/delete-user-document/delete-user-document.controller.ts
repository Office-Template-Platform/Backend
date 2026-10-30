// HTTP endpoint xóa một tài liệu thuộc workspace của trình duyệt hiện tại.
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
import { DeleteUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/delete-user-document/delete-user-document.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

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
        summary: 'Xóa tài liệu do người dùng tạo',
    })
    @ApiNoContentResponse({
        description:
            'Tài liệu đã được xóa khỏi thư viện của workspace hiện tại.',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy tài liệu trong workspace hiện tại.',
    })
    // UUID được kiểm tra ở HTTP boundary; lỗi không tồn tại và sai owner cùng trả 404 từ service.
    async remove(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ): Promise<void> {
        // 204 không có body; use case chỉ hoàn tất sau xóa DB và thử dọn file đầu ra.
        await this.deleteUserDocument.execute(documentId, workspaceId);
    }
}
