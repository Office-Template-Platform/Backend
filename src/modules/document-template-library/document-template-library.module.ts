// Module đăng ký HTTP controller, use case và adapter của thư viện mẫu văn bản.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';
import { ListDocumentTemplatesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-templates/list-document-templates.controller';
import { ListDocumentTemplateCategoriesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-template-categories/list-document-template-categories.controller';
import { DOCUMENT_TEMPLATE_READER } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { TypeOrmDocumentTemplateReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/document-templates/typeorm-document-template-reader.repository';

@Module({
    imports: [TypeOrmModule.forFeature([OfficeTemplate, TemplateCategory])],
    controllers: [ListDocumentTemplatesController, ListDocumentTemplateCategoriesController],
    providers: [
        ListDocumentTemplatesService,
        ListDocumentTemplateCategoriesService,
        TypeOrmDocumentTemplateReaderRepository,
        { provide: DOCUMENT_TEMPLATE_READER, useExisting: TypeOrmDocumentTemplateReaderRepository },
    ],
})
export class DocumentTemplateLibraryModule {}
