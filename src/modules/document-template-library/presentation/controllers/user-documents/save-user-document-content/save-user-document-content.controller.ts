// HTTP endpoint nhận và kiểm tra DOCX/PPTX đã chỉnh sửa trước khi lưu thành file đầu ra.
import {
    BadRequestException,
    Controller,
    Param,
    ParseUUIDPipe,
    PayloadTooLargeException,
    Put,
    UnsupportedMediaTypeException,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { SaveUserDocumentContentService } from '@/modules/document-template-library/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import type { UploadedOfficeDocumentFile } from '@/modules/document-template-library/presentation/types/uploaded-office-document-file';
import { CurrentAnonymousWorkspaceId } from '@/modules/document-template-library/presentation/decorators/current-anonymous-workspace-id.decorator';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';
import { getOfficeDocumentFormatByExtension } from '@/modules/document-template-library/application/types/office-document-format/office-document-format';

const MAX_EDITED_OFFICE_FILE_SIZE = 25 * 1024 * 1024;
const OFFICE_ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

@ApiTags('User documents')
@Controller('user-documents')
@UseGuards(AnonymousWorkspaceGuard)
// Controller nhận DOCX/PPTX đã sửa, xác thực loại file và giữ contract multipart chung.
export class SaveUserDocumentContentController {
    constructor(
        private readonly saveDocumentContent: SaveUserDocumentContentService,
    ) {}

    @Put(':documentId/content')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: MAX_EDITED_OFFICE_FILE_SIZE },
        }),
    )
    @ApiOperation({
        operationId: 'UserDocumentsController_saveContent',
        summary: 'Lưu nội dung DOCX hoặc PPTX đã chỉnh sửa',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    })
    @ApiOkResponse({
        description: 'Nội dung mới đã được lưu thành phiên bản đầu ra.',
    })
    // Thứ tự kiểm tra chặn request thiếu file và file quá cỡ trước khi đọc nội dung.
    async saveContent(
        @Param('documentId', ParseUUIDPipe) documentId: string,
        @UploadedFile() file: UploadedOfficeDocumentFile | undefined,
        @CurrentAnonymousWorkspaceId() workspaceId: string,
    ) {
        if (!file) {
            throw new BadRequestException(
                'Cần tải lên một file DOCX hoặc PPTX.',
            );
        }

        if (file.size > MAX_EDITED_OFFICE_FILE_SIZE) {
            throw new PayloadTooLargeException(
                'File Office không được vượt quá 25 MB.',
            );
        }

        // MIME và extension có thể bị giả mạo, nên đối chiếu chúng với ZIP signature và part OOXML.
        const extension = file.originalname.toLowerCase().split('.').pop();
        const format = extension
            ? getOfficeDocumentFormatByExtension(extension)
            : null;
        const requiredPackagePart =
            format?.extension === 'pptx'
                ? 'ppt/presentation.xml'
                : 'word/document.xml';
        if (
            !format ||
            file.mimetype !== format.mimeType ||
            !file.buffer.subarray(0, 4).equals(OFFICE_ZIP_HEADER) ||
            !file.buffer.includes(Buffer.from('[Content_Types].xml')) ||
            !file.buffer.includes(Buffer.from(requiredPackagePart))
        ) {
            throw new UnsupportedMediaTypeException(
                'File tải lên phải là DOCX hoặc PPTX hợp lệ và cùng định dạng với bản đã tạo.',
            );
        }

        return this.saveDocumentContent.executeForWorkspace(
            documentId,
            workspaceId,
            file.buffer,
            file.originalname,
        );
    }
}
