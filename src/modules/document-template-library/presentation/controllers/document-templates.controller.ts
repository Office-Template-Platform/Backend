// Controller HTTP cho danh mục mẫu văn bản; không đọc file hoặc truy vấn persistence.
import { Controller, Get } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { ListDocumentTemplatesService } from
    '@/modules/document-template-library/application/services/list-document-templates.service';

// Controller giữ ranh giới HTTP; application service phụ trách đọc danh mục.
@ApiTags('Document templates')
@Controller('document-templates')
export class DocumentTemplatesController {
    // Nhận use case qua Nest DI để route không tự giữ state nghiệp vụ.
    constructor(
        private readonly listDocumentTemplates: ListDocumentTemplatesService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Liệt kê mẫu văn bản' })
    @ApiOkResponse({ description: 'Danh sách metadata mẫu văn bản.' })
    // Chuyển request đọc danh mục sang application; service quyết định nguồn dữ liệu.
    list() {
        return this.listDocumentTemplates.execute();
    }
}
