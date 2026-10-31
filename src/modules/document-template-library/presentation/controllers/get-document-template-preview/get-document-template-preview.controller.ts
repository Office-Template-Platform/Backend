// HTTP endpoint stream ảnh thumbnail của phiên bản mẫu DOCX hiện hành.
import {
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';

@ApiTags('Document templates')
@Controller('document-templates')
// Controller stream thumbnail trực tiếp để response binary không bị đổi thành JSON.
export class GetDocumentTemplatePreviewController {
    constructor(
        private readonly getPreview: GetDocumentTemplatePreviewService,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    @Get(':templateId/preview')
    @ApiOperation({
        operationId: 'DocumentTemplatesController_preview',
        summary: 'Xem thumbnail của mẫu văn bản',
    })
    @ApiOkResponse({
        description: 'Nội dung ảnh thumbnail của phiên bản hiện hành.',
    })
    // Storage chỉ mở file sau khi use case xác nhận template và preview hiện hành.
    async get(
        @Param('templateId', ParseUUIDPipe) templateId: string,
    ): Promise<StreamableFile> {
        const { file } = await this.getPreview.execute(templateId);
        const stream = await this.fileStorage.openReadStream(file);

        return new StreamableFile(stream, { type: file.mimeType });
    }
}
