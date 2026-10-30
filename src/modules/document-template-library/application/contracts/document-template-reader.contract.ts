// Contract đọc catalog mẫu; mọi filter, join và pagination được adapter thực hiện trong database.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';

export type DocumentTemplateFilters = {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    featured?: boolean;
};

export type DocumentTemplateListItem = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    category: {
        id: string;
        name: string;
        slug: string;
    };
    isFeatured: boolean;
    currentVersion: number;
    previewUrl: string | null;
};

export type DocumentTemplateDetail = DocumentTemplateListItem & {
    createdAt: string;
    updatedAt: string;
};

export type DocumentTemplateCategory = {
    id: string;
    name: string;
    slug: string;
    templateCount: number;
};

export type PagedDocumentTemplates = {
    items: DocumentTemplateListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export type DocumentTemplateSource = {
    templateId: string;
    templateName: string;
    versionId: string;
    sourceFile: StoredFileReference;
};

// Reader chỉ xuất bản mẫu DOCX active và current-version; adapter chịu trách nhiệm bảo đảm điều kiện này.
export interface DocumentTemplateReaderContract {
    list(filters: DocumentTemplateFilters): Promise<PagedDocumentTemplates>;
    listCategories(): Promise<DocumentTemplateCategory[]>;
    findPublishedById(id: string): Promise<DocumentTemplateDetail | null>;
    findCurrentPreview(id: string): Promise<StoredFileReference | null>;
    findCurrentSource(id: string): Promise<DocumentTemplateSource | null>;
}

export const DOCUMENT_TEMPLATE_READER = Symbol('DOCUMENT_TEMPLATE_READER');
