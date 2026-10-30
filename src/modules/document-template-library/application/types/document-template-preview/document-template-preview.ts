// Dữ liệu transport cần để stream thumbnail mà không trả lộ đường dẫn nội bộ.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';

export type DocumentTemplatePreview = {
    file: StoredFileReference;
};
