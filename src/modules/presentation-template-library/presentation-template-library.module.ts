// Module sở hữu route/use case của thư viện PPTX và tái sử dụng hạ tầng user document đã có.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { PRESENTATION_TEMPLATE_READER } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { ListPresentationTemplatesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-templates/list-presentation-templates.service';
import { ListPresentationTemplatesController } from '@/modules/presentation-template-library/presentation/controllers/list-presentation-templates/list-presentation-templates.controller';
import { ListPresentationTemplateCategoriesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-template-categories/list-presentation-template-categories.service';
import { ListPresentationTemplateCategoriesController } from '@/modules/presentation-template-library/presentation/controllers/list-presentation-template-categories/list-presentation-template-categories.controller';
import { GetPresentationTemplateService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template/get-presentation-template.service';
import { GetPresentationTemplateController } from '@/modules/presentation-template-library/presentation/controllers/get-presentation-template/get-presentation-template.controller';
import { GetPresentationTemplatePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template-preview/get-presentation-template-preview.service';
import { GetPresentationTemplatePreviewController } from '@/modules/presentation-template-library/presentation/controllers/get-presentation-template-preview/get-presentation-template-preview.controller';
import { GetPresentationSlidePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-slide-preview/get-presentation-slide-preview.service';
import { GetPresentationSlidePreviewController } from '@/modules/presentation-template-library/presentation/controllers/get-presentation-slide-preview/get-presentation-slide-preview.controller';
import { CreateUserPresentationService } from '@/modules/presentation-template-library/application/services/user-presentations/create-user-presentation/create-user-presentation.service';
import { CreateUserPresentationController } from '@/modules/presentation-template-library/presentation/controllers/create-user-presentation/create-user-presentation.controller';
import { TypeOrmPresentationTemplateReaderRepository } from '@/modules/presentation-template-library/infrastructure/repositories/read/presentation-templates/typeorm-presentation-template-reader.repository';
import { DocumentFileStorageModule } from '@/modules/document-file-storage/document-file-storage.module';
import { UserDocumentManagementModule } from '@/modules/user-document-management/user-document-management.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([OfficeTemplate, TemplateCategory]),
        DocumentFileStorageModule,
        UserDocumentManagementModule,
    ],
    controllers: [
        ListPresentationTemplatesController,
        ListPresentationTemplateCategoriesController,
        GetPresentationTemplateController,
        GetPresentationTemplatePreviewController,
        GetPresentationSlidePreviewController,
        CreateUserPresentationController,
    ],
    providers: [
        ListPresentationTemplatesService,
        ListPresentationTemplateCategoriesService,
        GetPresentationTemplateService,
        GetPresentationTemplatePreviewService,
        GetPresentationSlidePreviewService,
        CreateUserPresentationService,
        TypeOrmPresentationTemplateReaderRepository,
        {
            provide: PRESENTATION_TEMPLATE_READER,
            useExisting: TypeOrmPresentationTemplateReaderRepository,
        },
    ],
})
export class PresentationTemplateLibraryModule {}
