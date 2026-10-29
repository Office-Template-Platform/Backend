// Module sở hữu riêng route và use case của thư viện mẫu văn bản.
import { Module } from '@nestjs/common';
import { ListDocumentTemplatesService } from
    '@/modules/document-template-library/application/services/list-document-templates.service';
import { DocumentTemplatesController } from
    '@/modules/document-template-library/presentation/controllers/document-templates.controller';

// Module đăng ký route và application service của riêng sản phẩm văn bản.
@Module({
    controllers: [DocumentTemplatesController],
    providers: [ListDocumentTemplatesService],
})
export class DocumentTemplateLibraryModule {}
