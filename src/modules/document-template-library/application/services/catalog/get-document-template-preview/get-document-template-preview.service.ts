// Use case lấy reference ảnh preview của phiên bản mẫu hiện hành để controller stream.
import { Inject, Injectable } from '@nestjs/common';
import { DocumentTemplatePreviewNotFoundError } from '@/modules/document-template-library/application/errors/document-template-preview-not-found.error';
import {
    DOCUMENT_TEMPLATE_READER,
    type DocumentTemplateReaderContract,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import type { DocumentTemplatePreview } from '@/modules/document-template-library/application/types/document-template-preview';

@Injectable()
// Tách metadata file khỏi stream để storage key không xuất hiện trong response JSON.
export class GetDocumentTemplatePreviewService {
    // Nội dung byte được storage adapter mở sau khi use case xác nhận có preview.
    constructor(
        @Inject(DOCUMENT_TEMPLATE_READER)
        private readonly templateReader: DocumentTemplateReaderContract,
    ) {}

    // 404 khi mẫu không public hoặc thiếu thumbnail; nhánh này không gọi storage.
    async execute(id: string): Promise<DocumentTemplatePreview> {
        const previewFile = await this.templateReader.findCurrentPreview(id);

        if (!previewFile) {
            throw new DocumentTemplatePreviewNotFoundError();
        }

        return { file: previewFile };
    }
}
