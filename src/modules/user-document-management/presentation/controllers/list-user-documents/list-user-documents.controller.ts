// HTTP endpoint liệt kê và phân trang các tài liệu thuộc workspace của trình duyệt hiện tại.
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListUserDocumentsService } from '@/modules/user-document-management/application/services/user-documents/list-user-documents/list-user-documents.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/user-document-management/presentation/decorators/current-anonymous-workspace-id.decorator';
import { ListUserDocumentsQueryDto } from '@/modules/user-document-management/presentation/dto/list-user-documents-query/list-user-documents-query.dto';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Controller nhận owner từ guard và không cho client tự chỉ định workspace khác.
export class ListUserDocumentsController {
    constructor(private readonly listUserDocuments: ListUserDocumentsService) {}

    @Get()
    @ApiOperation({
        operationId: 'UserDocumentsController_list',
        summary: 'Liệt kê tài liệu của trình duyệt hiện tại',
    })
    @ApiOkResponse({
        description:
            'Danh sách có phân trang, tìm kiếm và bản cập nhật gần nhất.',
    })
    // DTO xác thực giới hạn trang trước khi service gọi reader theo workspace.
    list(
        @CurrentAnonymousWorkspaceId() workspaceId: string,
        @Query() query: ListUserDocumentsQueryDto,
    ) {
        return this.listUserDocuments.execute(workspaceId, query);
    }

    @Get('trash/items')
    @ApiOperation({
        operationId: 'UserDocumentsController_listTrash',
        summary: 'Liệt kê tài liệu trong thùng rác',
    })
    @ApiOkResponse({
        description:
            'Danh sách tài liệu đã xóa mềm trong workspace hiện tại, có phân trang và tìm kiếm.',
    })
    // Route hai đoạn tránh va chạm với GET /user-documents/:documentId; workspace vẫn do guard xác định.
    listTrash(
        @CurrentAnonymousWorkspaceId() workspaceId: string,
        @Query() query: ListUserDocumentsQueryDto,
    ) {
        return this.listUserDocuments.executeDeleted(workspaceId, query);
    }
}
