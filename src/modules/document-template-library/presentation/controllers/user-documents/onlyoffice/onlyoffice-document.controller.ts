// HTTP boundary cho editor DOCX/PPTX; callback phải trả body thuần theo contract ONLYOFFICE.
import {
    Controller,
    Get,
    Headers,
    HttpException,
    Logger,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Res,
    StreamableFile,
    UseGuards,
    Body,
    Inject,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { OFFICE_DOCUMENT_FORMATS } from '@/modules/document-template-library/application/types/office-document-format/office-document-format';
import {
    DOCUMENT_FILE_STORAGE,
    type DocumentFileStorageContract,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetUserDocumentEditorConfigService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-config/get-user-document-editor-config.service';
import { GetUserDocumentEditorFileService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-file/get-user-document-editor-file.service';
import { HandleOnlyOfficeCallbackService } from '@/modules/document-template-library/application/services/user-documents/handle-onlyoffice-callback/handle-onlyoffice-callback.service';
import type { OnlyOfficeCallbackPayload } from '@/integrations/onlyoffice/types/onlyoffice-docs.types';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

@ApiTags('User documents')
@Controller('user-documents')
// Kết nối editor-config, file fetch nội bộ và callback đã ký vào ba thao tác HTTP riêng.
export class OnlyOfficeDocumentController {
    private readonly logger = new Logger(OnlyOfficeDocumentController.name);

    constructor(
        private readonly getEditorConfig: GetUserDocumentEditorConfigService,
        private readonly getEditorFile: GetUserDocumentEditorFileService,
        private readonly handleOnlyOfficeCallback: HandleOnlyOfficeCallbackService,
        @Inject(DOCUMENT_FILE_STORAGE)
        private readonly fileStorage: DocumentFileStorageContract,
    ) {}

    @Get(':documentId/editor-config')
    @UseGuards(AnonymousWorkspaceGuard)
    @ApiOperation({
        operationId: 'UserDocumentsController_editorConfig',
        summary:
            'Tạo cấu hình ONLYOFFICE để sửa DOCX hoặc PPTX trong trình duyệt',
    })
    @ApiOkResponse({
        description: 'URL API script và cấu hình editor đã ký ở backend.',
    })
    // Trả JWT ngắn hạn cho đúng revision; secret dùng ký không được gửi về frontend.
    getEditorConfiguration(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ) {
        return this.getEditorConfig.execute(documentId, workspaceId);
    }

    @Get(':documentId/editor-file')
    @ApiOperation({
        operationId: 'UserDocumentsController_editorFile',
        summary: 'Cấp file DOCX hoặc PPTX cho Document Server',
    })
    @ApiProduces(
        OFFICE_DOCUMENT_FORMATS.docx.mimeType,
        OFFICE_DOCUMENT_FORMATS.pptx.mimeType,
    )
    // URL có chữ ký và revision; stream nội tuyến để Document Server không tải nhầm mẫu gốc.
    async getEditorDocument(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @Query('token') token: string | undefined,
    ): Promise<StreamableFile> {
        const { file, filename } = await this.getEditorFile.execute(
            documentId,
            token,
        );
        const stream = await this.fileStorage.openReadStream(file);
        const encodedFilename = encodeURIComponent(filename);
        const fallbackExtension =
            file.mimeType === OFFICE_DOCUMENT_FORMATS.pptx.mimeType
                ? 'pptx'
                : 'docx';

        return new StreamableFile(stream, {
            type: file.mimeType,
            disposition: `inline; filename="document.${fallbackExtension}"; filename*=UTF-8''${encodedFilename}`,
        });
    }

    @Post(':documentId/onlyoffice-callback')
    @ApiOperation({
        operationId: 'UserDocumentsController_onlyOfficeCallback',
        summary: 'Nhận trạng thái lưu từ ONLYOFFICE Docs',
    })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['key', 'status'],
            properties: {
                key: { type: 'string' },
                status: { type: 'integer', example: 2 },
                url: { type: 'string', format: 'uri' },
                filetype: { type: 'string', enum: ['docx', 'pptx'] },
            },
        },
    })
    @ApiOkResponse({
        description:
            'Body thuần { error: 0 } khi callback được xử lý thành công.',
    })
    // Gửi JSON nguyên dạng, không bọc { success, data }; Document Server dựa vào error: 0.
    async receiveOnlyOfficeCallback(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @Headers('authorization') authorizationHeader: string | undefined,
        @Body() payload: OnlyOfficeCallbackPayload,
        @Res() response: Response,
    ): Promise<void> {
        try {
            await this.handleOnlyOfficeCallback.execute(
                documentId,
                authorizationHeader,
                payload,
            );
            response.status(200).json({ error: 0 });
        } catch (error) {
            const statusCode =
                error instanceof HttpException ? error.getStatus() : 500;

            // Lưu stack của lỗi server nhưng không ghi JWT hoặc payload callback vào log.
            if (statusCode >= 500) {
                this.logger.error(
                    `Lỗi xử lý callback ONLYOFFICE cho tài liệu ${documentId}.`,
                    error instanceof Error ? error.stack : undefined,
                );
            }

            response.status(statusCode).json({ error: 1 });
        }
    }
}
