// Module sở hữu route/use case của thư viện PPTX và tái sử dụng hạ tầng user document đã có.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { PRESENTATION_TEMPLATE_READER } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { ListPresentationTemplatesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-templates/list-presentation-templates.service';
import { ListPresentationTemplatesController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/list-presentation-templates/list-presentation-templates.controller';
import { ListPresentationTemplateCategoriesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-template-categories/list-presentation-template-categories.service';
import { ListPresentationTemplateCategoriesController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/list-presentation-template-categories/list-presentation-template-categories.controller';
import { GetPresentationTemplateService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template/get-presentation-template.service';
import { GetPresentationTemplateController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/get-presentation-template/get-presentation-template.controller';
import { GetPresentationTemplatePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template-preview/get-presentation-template-preview.service';
import { GetPresentationTemplatePreviewController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/get-presentation-template-preview/get-presentation-template-preview.controller';
import { GetPresentationSlidePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-slide-preview/get-presentation-slide-preview.service';
import { GetPresentationSlidePreviewController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/get-presentation-slide-preview/get-presentation-slide-preview.controller';
import { TypeOrmPresentationTemplateReaderRepository } from '@/modules/presentation-template-library/infrastructure/repositories/read/presentation-templates/typeorm-presentation-template-reader.repository';
import { DocumentTemplateLibraryModule } from '@/modules/document-template-library/document-template-library.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([OfficeTemplate, TemplateCategory]),
        DocumentTemplateLibraryModule,
    ],
    controllers: [
        ListPresentationTemplatesController,
        ListPresentationTemplateCategoriesController,
        GetPresentationTemplateController,
        GetPresentationTemplatePreviewController,
        GetPresentationSlidePreviewController,
    ],
    providers: [
        ListPresentationTemplatesService,
        ListPresentationTemplateCategoriesService,
        GetPresentationTemplateService,
        GetPresentationTemplatePreviewService,
        GetPresentationSlidePreviewService,
        TypeOrmPresentationTemplateReaderRepository,
        {
            provide: PRESENTATION_TEMPLATE_READER,
            useExisting: TypeOrmPresentationTemplateReaderRepository,
        },
    ],
})
export class PresentationTemplateLibraryModule {}
