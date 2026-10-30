// HTTP endpoint nhận và kiểm tra DOCX đã chỉnh sửa trước khi lưu thành file đầu ra.
import {
    BadRequestException,
    Controller,
    Param,
    ParseUUIDPipe,
    PayloadTooLargeException,
    Put,
    UnsupportedMediaTypeException,
    UploadedFile,
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
import type { UploadedDocxFile } from '@/modules/document-template-library/presentation/types/uploaded-docx-file';

const MAX_EDITED_DOCX_SIZE = 25 * 1024 * 1024;
const DOCX_MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

@ApiTags('User documents')
@Controller('user-documents')
// Controller chỉ sở hữu endpoint upload DOCX, giới hạn request và giữ contract multipart.
export class SaveUserDocumentContentController {
    constructor(
        private readonly saveDocumentContent: SaveUserDocumentContentService,
    ) {}

    @Put(':documentId/content')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_EDITED_DOCX_SIZE } }),
    )
    @ApiOperation({
        operationId: 'UserDocumentsController_saveContent',
        summary: 'Lưu nội dung DOCX đã chỉnh sửa',
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
        @UploadedFile() file?: UploadedDocxFile,
    ) {
        if (!file) {
            throw new BadRequestException('Cần tải lên một file DOCX.');
        }

        if (file.size > MAX_EDITED_DOCX_SIZE) {
            throw new PayloadTooLargeException(
                'File DOCX không được vượt quá 25 MB.',
            );
        }

        // MIME và extension do client khai báo, vì vậy phải xác thực thêm signature và part OOXML.
        if (
            file.mimetype !== DOCX_MIME_TYPE ||
            !file.originalname.toLowerCase().endsWith('.docx') ||
            !file.buffer.subarray(0, 4).equals(DOCX_ZIP_HEADER) ||
            !file.buffer.includes(Buffer.from('[Content_Types].xml')) ||
            !file.buffer.includes(Buffer.from('word/document.xml'))
        ) {
            throw new UnsupportedMediaTypeException(
                'File tải lên phải là tài liệu DOCX hợp lệ.',
            );
        }

        return this.saveDocumentContent.execute(
            documentId,
            file.buffer,
            file.originalname,
        );
    }
}
