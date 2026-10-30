// Module đăng ký HTTP controller, use case và adapter của thư viện mẫu văn bản.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';
import { ListDocumentTemplatesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-templates/list-document-templates.controller';
import { ListDocumentTemplateCategoriesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-template-categories/list-document-template-categories.controller';
import { GetDocumentTemplateController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template/get-document-template.controller';
import { GetDocumentTemplatePreviewController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template-preview/get-document-template-preview.controller';
import { CreateUserDocumentController } from '@/modules/document-template-library/presentation/controllers/document-templates/create-user-document/create-user-document.controller';
import { DOCUMENT_TEMPLATE_READER } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { TypeOrmDocumentTemplateReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/document-templates/typeorm-document-template-reader.repository';
import { DOCUMENT_FILE_STORAGE } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { LocalDocumentFileStorage } from '@/modules/document-template-library/infrastructure/storage/local-document-file-storage';
import { USER_DOCUMENT_WRITER } from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { TypeOrmUserDocumentWriterRepository } from '@/modules/document-template-library/infrastructure/repositories/write/typeorm-user-document-writer.repository';

@Module({
    imports: [TypeOrmModule.forFeature([OfficeTemplate, TemplateCategory, StoredFile, UserDocument])],
    controllers: [ListDocumentTemplatesController, ListDocumentTemplateCategoriesController, GetDocumentTemplateController, GetDocumentTemplatePreviewController, CreateUserDocumentController],
    providers: [
        ListDocumentTemplatesService,
        ListDocumentTemplateCategoriesService,
        GetDocumentTemplateService,
        GetDocumentTemplatePreviewService,
        CreateUserDocumentService,
        TypeOrmDocumentTemplateReaderRepository,
        LocalDocumentFileStorage,
        TypeOrmUserDocumentWriterRepository,
        { provide: DOCUMENT_TEMPLATE_READER, useExisting: TypeOrmDocumentTemplateReaderRepository },
        { provide: DOCUMENT_FILE_STORAGE, useExisting: LocalDocumentFileStorage },
        { provide: USER_DOCUMENT_WRITER, useExisting: TypeOrmUserDocumentWriterRepository },
    ],
})
export class DocumentTemplateLibraryModule {}
