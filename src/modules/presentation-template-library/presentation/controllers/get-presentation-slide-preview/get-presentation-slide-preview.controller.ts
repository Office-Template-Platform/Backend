// HTTP endpoint stream thumbnail theo slide number của version PPTX hiện hành.
import {
    Controller,
    Get,
    Inject,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { GetPresentationSlidePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-slide-preview/get-presentation-slide-preview.service';

@ApiTags('Presentation templates')
@Controller('presentation-templates')
// Mỗi slide preview là binary riêng, metadata title và vị trí được trả ở endpoint detail.
export class GetPresentationSlidePreviewController {
    constructor(
        private readonly getSlidePreview: GetPresentationSlidePreviewService,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    @Get(':templateId/slides/:slideNumber/preview')
    @ApiOperation({
        operationId: 'PresentationTemplatesController_slidePreview',
        summary: 'Xem thumbnail của một slide',
    })
    @ApiOkResponse({ description: 'Ảnh xem trước của slide được yêu cầu.' })
    // Parse số nguyên trước khi gọi service; service tiếp tục từ chối số nhỏ hơn một.
    async get(
        @Param('templateId', ParseUUIDPipe) templateId: string,
        @Param('slideNumber', ParseIntPipe) slideNumber: number,
    ): Promise<StreamableFile> {
        const { file } = await this.getSlidePreview.execute(
            templateId,
            slideNumber,
        );
        const stream = await this.fileStorage.openReadStream(file);

        return new StreamableFile(stream, { type: file.mimeType });
    }
}
