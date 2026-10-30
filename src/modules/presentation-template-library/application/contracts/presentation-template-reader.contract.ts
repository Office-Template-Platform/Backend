// Port đọc catalog PPTX; mọi filter, join và mapping persistence thuộc infrastructure.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type {
    PresentationTemplateCategory,
    PresentationTemplateDetail,
    PresentationTemplateSummary,
} from '@/modules/presentation-template-library/application/types/presentation-template-summary';

export type PresentationTemplateFilters = {
    search?: string;
    categoryId?: string;
};

export type PresentationTemplateSource = {
    templateId: string;
    templateName: string;
    versionId: string;
    sourceFile: StoredFileReference;
};

// Reader chỉ trả mẫu PRESENTATION đã published, chưa xóa và thuộc category đang hoạt động.
export interface PresentationTemplateReaderContract {
    list(
        filters: PresentationTemplateFilters,
    ): Promise<PresentationTemplateSummary[]>;
    listCategories(): Promise<PresentationTemplateCategory[]>;
    findPublishedById(id: string): Promise<PresentationTemplateDetail | null>;
    findCurrentPreview(id: string): Promise<StoredFileReference | null>;
    findSlidePreview(
        id: string,
        slideNumber: number,
    ): Promise<StoredFileReference | null>;
    findCurrentSource(id: string): Promise<PresentationTemplateSource | null>;
}

export const PRESENTATION_TEMPLATE_READER = Symbol(
    'PRESENTATION_TEMPLATE_READER',
);
