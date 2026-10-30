// Use case liệt kê mẫu DOCX; repository đọc, lọc và phân trang hoàn toàn trong PostgreSQL.
import { Inject, Injectable } from '@nestjs/common';
import type {
    DocumentTemplateFilters,
    DocumentTemplateReaderContract,
    PagedDocumentTemplates,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { DOCUMENT_TEMPLATE_READER } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';

@Injectable()
// Nhận contract đọc catalog để service không phụ thuộc TypeORM hoặc query builder.
export class ListDocumentTemplatesService {
    // Repository chỉ nhận filter đã được DTO xác thực ở presentation boundary.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
    ) {}

    // Trả nguyên trang repository để không thay đổi metadata pagination của API.
    execute(filters: DocumentTemplateFilters): Promise<PagedDocumentTemplates> {
        return this.templateReader.list(filters);
    }
}
