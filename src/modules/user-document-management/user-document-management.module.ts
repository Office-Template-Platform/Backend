// Module sở hữu workspace ẩn danh và toàn bộ vòng đời tài liệu do người dùng tạo.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnonymousWorkspace } from '@/database/entities/anonymous-workspace.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { OnlyOfficeDocsModule } from '@/integrations/onlyoffice/onlyoffice-docs.module';
import { ANONYMOUS_WORKSPACE_REPOSITORY } from '@/modules/user-document-management/application/contracts/anonymous-workspace-repository.contract';
import { USER_DOCUMENT_DELETER } from '@/modules/user-document-management/application/contracts/user-document-deleter.contract';
import { USER_DOCUMENT_READER } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { USER_DOCUMENT_RESTORER } from '@/modules/user-document-management/application/contracts/user-document-restorer.contract';
import { USER_DOCUMENT_WRITER } from '@/modules/user-document-management/application/contracts/user-document-writer.contract';
import { CreateUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/create-user-document/create-user-document.service';
import { DeleteUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/delete-user-document/delete-user-document.service';
import { DownloadUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/download-user-document/download-user-document.service';
import { GetUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/get-user-document/get-user-document.service';
import { GetUserDocumentEditorConfigService } from '@/modules/user-document-management/application/services/user-documents/get-user-document-editor-config/get-user-document-editor-config.service';
import { GetUserDocumentEditorFileService } from '@/modules/user-document-management/application/services/user-documents/get-user-document-editor-file/get-user-document-editor-file.service';
import { HandleOnlyOfficeCallbackService } from '@/modules/user-document-management/application/services/user-documents/handle-onlyoffice-callback/handle-onlyoffice-callback.service';
import { ListUserDocumentsService } from '@/modules/user-document-management/application/services/user-documents/list-user-documents/list-user-documents.service';
import { RestoreUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/restore-user-document/restore-user-document.service';
import { SaveUserDocumentContentService } from '@/modules/user-document-management/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import { AnonymousWorkspaceService } from '@/modules/user-document-management/application/services/workspaces/anonymous-workspace.service';
import { TypeOrmUserDocumentReaderRepository } from '@/modules/user-document-management/infrastructure/repositories/read/user-documents/typeorm-user-document-reader.repository';
import { TypeOrmAnonymousWorkspaceRepository } from '@/modules/user-document-management/infrastructure/repositories/workspaces/typeorm-anonymous-workspace.repository';
import { TypeOrmUserDocumentDeleterRepository } from '@/modules/user-document-management/infrastructure/repositories/write/delete-user-document/typeorm-user-document-deleter.repository';
import { TypeOrmUserDocumentRestorerRepository } from '@/modules/user-document-management/infrastructure/repositories/write/restore-user-document/typeorm-user-document-restorer.repository';
import { TypeOrmUserDocumentWriterRepository } from '@/modules/user-document-management/infrastructure/repositories/write/write-user-document/typeorm-user-document-writer.repository';
import { CreateUserDocumentController } from '@/modules/user-document-management/presentation/controllers/create-user-document/create-user-document.controller';
import { DeleteUserDocumentController } from '@/modules/user-document-management/presentation/controllers/delete-user-document/delete-user-document.controller';
import { DownloadUserDocumentController } from '@/modules/user-document-management/presentation/controllers/download-user-document/download-user-document.controller';
import { GetUserDocumentController } from '@/modules/user-document-management/presentation/controllers/get-user-document/get-user-document.controller';
import { ListUserDocumentsController } from '@/modules/user-document-management/presentation/controllers/list-user-documents/list-user-documents.controller';
import { OnlyOfficeDocumentController } from '@/modules/user-document-management/presentation/controllers/onlyoffice/onlyoffice-document.controller';
import { RestoreUserDocumentController } from '@/modules/user-document-management/presentation/controllers/restore-user-document/restore-user-document.controller';
import { SaveUserDocumentContentController } from '@/modules/user-document-management/presentation/controllers/save-user-document-content/save-user-document-content.controller';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';
import { DocumentFileStorageModule } from '@/modules/document-file-storage/document-file-storage.module';
import { DocumentTemplateLibraryModule } from '@/modules/document-template-library/document-template-library.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AnonymousWorkspace, UserDocument]),
        DocumentFileStorageModule,
        DocumentTemplateLibraryModule,
        OnlyOfficeDocsModule,
    ],
    controllers: [
        CreateUserDocumentController,
        ListUserDocumentsController,
        GetUserDocumentController,
        SaveUserDocumentContentController,
        DownloadUserDocumentController,
        DeleteUserDocumentController,
        RestoreUserDocumentController,
        OnlyOfficeDocumentController,
    ],
    providers: [
        CreateUserDocumentService,
        ListUserDocumentsService,
        GetUserDocumentService,
        SaveUserDocumentContentService,
        DownloadUserDocumentService,
        DeleteUserDocumentService,
        RestoreUserDocumentService,
        GetUserDocumentEditorConfigService,
        GetUserDocumentEditorFileService,
        HandleOnlyOfficeCallbackService,
        AnonymousWorkspaceService,
        AnonymousWorkspaceGuard,
        TypeOrmAnonymousWorkspaceRepository,
        TypeOrmUserDocumentReaderRepository,
        TypeOrmUserDocumentWriterRepository,
        TypeOrmUserDocumentDeleterRepository,
        TypeOrmUserDocumentRestorerRepository,
        {
            provide: ANONYMOUS_WORKSPACE_REPOSITORY,
            useExisting: TypeOrmAnonymousWorkspaceRepository,
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
            provide: USER_DOCUMENT_DELETER,
            useExisting: TypeOrmUserDocumentDeleterRepository,
        },
        {
            provide: USER_DOCUMENT_RESTORER,
            useExisting: TypeOrmUserDocumentRestorerRepository,
        },
    ],
    // Presentation tạo PPTX dùng writer và workspace guard qua các contract công khai này.
    exports: [
        USER_DOCUMENT_WRITER,
        AnonymousWorkspaceService,
        AnonymousWorkspaceGuard,
    ],
})
export class UserDocumentManagementModule {}
