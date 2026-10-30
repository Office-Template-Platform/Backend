// Reference ảnh nội bộ để controller stream thumbnail hoặc ảnh slide mà không trả object key.
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';

export type PresentationTemplatePreview = {
    file: StoredFileReference;
};
