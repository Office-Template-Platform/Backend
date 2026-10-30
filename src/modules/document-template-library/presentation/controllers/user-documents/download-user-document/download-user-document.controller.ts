// HTTP endpoint stream file DOCX đầu ra dưới dạng tệp đính kèm.
import {
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { DownloadUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/download-user-document/download-user-document.service';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Controller xác nhận file khả dụng qua use case rồi stream qua storage port.
export class DownloadUserDocumentController {
    constructor(
        private readonly getDocumentDownload: DownloadUserDocumentService,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    @Get(':documentId/download')
    @ApiOperation({
        operationId: 'UserDocumentsController_download',
        summary: 'Tải DOCX do người dùng tạo',
    })
    @ApiOkResponse({
        description: 'File DOCX được stream dưới dạng attachment.',
    })
    // Header RFC 5987 giữ Unicode và khoảng trắng an toàn trong tên file.
    async download(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ): Promise<StreamableFile> {
        const { file, filename } = await this.getDocumentDownload.execute(
            documentId,
            workspaceId,
        );
        const stream = await this.fileStorage.openReadStream(file);
        const encodedFilename = encodeURIComponent(filename);

        return new StreamableFile(stream, {
            type: file.mimeType,
            disposition: `attachment; filename="document.docx"; filename*=UTF-8''${encodedFilename}`,
        });
    }
}
