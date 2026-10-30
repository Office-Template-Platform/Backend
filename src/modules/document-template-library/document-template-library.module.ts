// Module đăng ký từng API mẫu, tài liệu cá nhân và adapter lưu trữ tương ứng.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnonymousWorkspace } from '@/database/entities/anonymous-workspace.entity';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { OnlyOfficeDocsModule } from '@/integrations/onlyoffice/onlyoffice-docs.module';
import { DOCUMENT_FILE_STORAGE } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { DOCUMENT_TEMPLATE_READER } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { ANONYMOUS_WORKSPACE_REPOSITORY } from '@/modules/document-template-library/application/contracts/anonymous-workspace-repository.contract';
import { USER_DOCUMENT_READER } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { USER_DOCUMENT_WRITER } from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';
import { DownloadUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/download-user-document/download-user-document.service';
import { GetUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/get-user-document/get-user-document.service';
import { GetUserDocumentEditorConfigService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-config/get-user-document-editor-config.service';
import { GetUserDocumentEditorFileService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-file/get-user-document-editor-file.service';
import { HandleOnlyOfficeCallbackService } from '@/modules/document-template-library/application/services/user-documents/handle-onlyoffice-callback/handle-onlyoffice-callback.service';
import { ListUserDocumentsService } from '@/modules/document-template-library/application/services/user-documents/list-user-documents/list-user-documents.service';
import { SaveUserDocumentContentService } from '@/modules/document-template-library/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import { AnonymousWorkspaceService } from '@/modules/document-template-library/application/services/workspaces/anonymous-workspace.service';
import { TypeOrmAnonymousWorkspaceRepository } from '@/modules/document-template-library/infrastructure/repositories/workspaces/typeorm-anonymous-workspace.repository';
import { TypeOrmDocumentTemplateReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/document-templates/typeorm-document-template-reader.repository';
import { TypeOrmUserDocumentReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/user-documents/typeorm-user-document-reader.repository';
import { TypeOrmUserDocumentWriterRepository } from '@/modules/document-template-library/infrastructure/repositories/write/typeorm-user-document-writer.repository';
import { LocalDocumentFileStorage } from '@/modules/document-template-library/infrastructure/storage/local-document-file-storage';
import { CreateUserDocumentController } from '@/modules/document-template-library/presentation/controllers/document-templates/create-user-document/create-user-document.controller';
import { GetDocumentTemplateController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template/get-document-template.controller';
import { GetDocumentTemplatePreviewController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template-preview/get-document-template-preview.controller';
import { ListDocumentTemplateCategoriesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-template-categories/list-document-template-categories.controller';
import { ListDocumentTemplatesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-templates/list-document-templates.controller';
import { DownloadUserDocumentController } from '@/modules/document-template-library/presentation/controllers/user-documents/download-user-document/download-user-document.controller';
import { GetUserDocumentController } from '@/modules/document-template-library/presentation/controllers/user-documents/get-user-document/get-user-document.controller';
import { ListUserDocumentsController } from '@/modules/document-template-library/presentation/controllers/user-documents/list-user-documents/list-user-documents.controller';
import { OnlyOfficeDocumentController } from '@/modules/document-template-library/presentation/controllers/user-documents/onlyoffice/onlyoffice-document.controller';
import { SaveUserDocumentContentController } from '@/modules/document-template-library/presentation/controllers/user-documents/save-user-document-content/save-user-document-content.controller';
import { AnonymousWorkspaceGuard } from '@/modules/document-template-library/presentation/guards/anonymous-workspace.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AnonymousWorkspace,
            OfficeTemplate,
            TemplateCategory,
            UserDocument,
        ]),
        OnlyOfficeDocsModule,
    ],
    controllers: [
        ListDocumentTemplatesController,
        ListDocumentTemplateCategoriesController,
        GetDocumentTemplateController,
        GetDocumentTemplatePreviewController,
        CreateUserDocumentController,
        GetUserDocumentController,
        ListUserDocumentsController,
        SaveUserDocumentContentController,
        DownloadUserDocumentController,
        OnlyOfficeDocumentController,
    ],
    providers: [
        ListDocumentTemplatesService,
        ListDocumentTemplateCategoriesService,
        GetDocumentTemplateService,
        GetDocumentTemplatePreviewService,
        CreateUserDocumentService,
        GetUserDocumentService,
        ListUserDocumentsService,
        SaveUserDocumentContentService,
        DownloadUserDocumentService,
        GetUserDocumentEditorConfigService,
        GetUserDocumentEditorFileService,
        HandleOnlyOfficeCallbackService,
        AnonymousWorkspaceService,
        AnonymousWorkspaceGuard,
        TypeOrmAnonymousWorkspaceRepository,
        TypeOrmDocumentTemplateReaderRepository,
        TypeOrmUserDocumentReaderRepository,
        TypeOrmUserDocumentWriterRepository,
        LocalDocumentFileStorage,
        {
            provide: ANONYMOUS_WORKSPACE_REPOSITORY,
            useExisting: TypeOrmAnonymousWorkspaceRepository,
        },
        {
            provide: DOCUMENT_TEMPLATE_READER,
            useExisting: TypeOrmDocumentTemplateReaderRepository,
        },
        {
            provide: USER_DOCUMENT_READER,
            useExisting: TypeOrmUserDocumentReaderRepository,
        },
        {
            provide: USER_DOCUMENT_WRITER,
            useExisting: TypeOrmUserDocumentWriterRepository,
        },
        {
            provide: DOCUMENT_FILE_STORAGE,
            useExisting: LocalDocumentFileStorage,
        },
    ],
    exports: [
        DOCUMENT_FILE_STORAGE,
        USER_DOCUMENT_WRITER,
        AnonymousWorkspaceService,
    ],
})
export class DocumentTemplateLibraryModule {}
