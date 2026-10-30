// Use case liệt kê danh mục đang hoạt động cùng số mẫu DOCX đã xuất bản.
import { Inject, Injectable } from '@nestjs/common';
import type { DocumentTemplateCategory } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import {
    DOCUMENT_TEMPLATE_READER,
    type DocumentTemplateReaderContract,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';

@Injectable()
// Ủy quyền truy vấn và đếm mẫu cho adapter để application không giữ logic SQL.
export class ListDocumentTemplateCategoriesService {
    // Dùng cùng contract catalog với use case liệt kê mẫu.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
    ) {}

    // Trả nguyên danh sách để frontend dùng làm filter cho catalog.
    execute(): Promise<DocumentTemplateCategory[]> {
        return this.templateReader.listCategories();
    }
}
