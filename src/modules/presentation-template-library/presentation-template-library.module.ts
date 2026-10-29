// Module sở hữu riêng route và use case của thư viện mẫu trình chiếu.
import { Module } from '@nestjs/common';
import { ListPresentationTemplatesService } from
    '@/modules/presentation-template-library/application/services/list-presentation-templates.service';
import { PresentationTemplatesController } from
    '@/modules/presentation-template-library/presentation/controllers/presentation-templates.controller';

// Module đăng ký route và application service của riêng sản phẩm trình chiếu.
@Module({
    controllers: [PresentationTemplatesController],
    providers: [ListPresentationTemplatesService],
})
export class PresentationTemplateLibraryModule {}
