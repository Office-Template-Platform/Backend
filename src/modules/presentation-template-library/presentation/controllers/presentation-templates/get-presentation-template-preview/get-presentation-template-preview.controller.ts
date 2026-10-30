// HTTP endpoint stream thumbnail của bộ PPTX theo MIME của StoredFile.
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
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetPresentationTemplatePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template-preview/get-presentation-template-preview.service';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
// Binary preview được stream riêng để response envelope không chuyển ảnh thành JSON.
export class GetPresentationTemplatePreviewController {
    constructor(
        private readonly getPreview: GetPresentationTemplatePreviewService,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    @Get(':templateId/preview')
    @ApiOperation({
        operationId: 'PresentationTemplatesController_preview',
        summary: 'Xem thumbnail của mẫu trình chiếu',
    })
    @ApiOkResponse({ description: 'Ảnh thumbnail của version hiện hành.' })
    // Chỉ mở stream sau khi use case xác nhận thumbnail thuộc mẫu public hiện hành.
    async get(
        @Param('templateId', ParseUUIDPipe) templateId: string,
    ): Promise<StreamableFile> {
        const { file } = await this.getPreview.execute(templateId);
        const stream = await this.fileStorage.openReadStream(file);

        return new StreamableFile(stream, { type: file.mimeType });
    }
}
