// Use case đọc chi tiết một mẫu công khai; trạng thái draft/archive được adapter ẩn như 404.
import { Inject, Injectable } from '@nestjs/common';
import { DocumentTemplateNotFoundError } from '@/modules/document-template-library/application/errors/document-template-not-found.error';
import {
    DOCUMENT_TEMPLATE_READER,
    type DocumentTemplateReaderContract,
    type DocumentTemplateDetail,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';

@Injectable()
// Chuyển kết quả đọc thành hợp đồng HTTP ổn định, không lộ trạng thái quản trị của mẫu.
export class GetDocumentTemplateService {
    // Service chỉ phụ thuộc vào contract đọc mẫu đã xuất bản.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
    ) {}

    // Trả 404 nếu không tìm thấy bản công khai; nếu có thì trả nguyên metadata đã map.
    async execute(id: string): Promise<DocumentTemplateDetail> {
        const template = await this.templateReader.findPublishedById(id);

        if (!template) {
            throw new DocumentTemplateNotFoundError();
        }

        return template;
    }
}
