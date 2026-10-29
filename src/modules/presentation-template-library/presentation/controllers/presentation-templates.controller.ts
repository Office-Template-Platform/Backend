// Controller HTTP cho danh mục trình chiếu; không đọc file hoặc truy vấn persistence.
import { Controller, Get } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { ListPresentationTemplatesService } from
    '@/modules/presentation-template-library/application/services/list-presentation-templates.service';

// Controller giữ ranh giới HTTP; application service phụ trách đọc danh mục.
@ApiTags('Presentation templates')
@Controller('presentation-templates')
export class PresentationTemplatesController {
    // Nhận use case qua Nest DI để route không tự giữ state nghiệp vụ.
    constructor(
        private readonly listPresentationTemplates:
            ListPresentationTemplatesService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Liệt kê bộ mẫu trình chiếu' })
    @ApiOkResponse({ description: 'Danh sách metadata bộ mẫu trình chiếu.' })
    // Chuyển request đọc danh mục sang application; service quyết định nguồn dữ liệu.
    list() {
        return this.listPresentationTemplates.execute();
    }
}
