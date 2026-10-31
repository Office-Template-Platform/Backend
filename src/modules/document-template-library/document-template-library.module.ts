// Module chỉ sở hữu API catalog DOCX và công bố các port đọc mẫu, lưu file dùng chung.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { DOCUMENT_TEMPLATE_READER } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { TypeOrmDocumentTemplateReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/document-templates/typeorm-document-template-reader.repository';
import { GetDocumentTemplateController } from '@/modules/document-template-library/presentation/controllers/get-document-template/get-document-template.controller';
import { GetDocumentTemplatePreviewController } from '@/modules/document-template-library/presentation/controllers/get-document-template-preview/get-document-template-preview.controller';
import { ListDocumentTemplateCategoriesController } from '@/modules/document-template-library/presentation/controllers/list-document-template-categories/list-document-template-categories.controller';
import { ListDocumentTemplatesController } from '@/modules/document-template-library/presentation/controllers/list-document-templates/list-document-templates.controller';
import { DocumentFileStorageModule } from '@/modules/document-file-storage/document-file-storage.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([OfficeTemplate, TemplateCategory]),
        DocumentFileStorageModule,
    ],
    controllers: [
        ListDocumentTemplatesController,
        ListDocumentTemplateCategoriesController,
        GetDocumentTemplateController,
        GetDocumentTemplatePreviewController,
    ],
    providers: [
        ListDocumentTemplatesService,
        ListDocumentTemplateCategoriesService,
        GetDocumentTemplateService,
        GetDocumentTemplatePreviewService,
        TypeOrmDocumentTemplateReaderRepository,
        {
            provide: DOCUMENT_TEMPLATE_READER,
            useExisting: TypeOrmDocumentTemplateReaderRepository,
        },
    ],
    exports: [DOCUMENT_TEMPLATE_READER],
})
export class DocumentTemplateLibraryModule {}
