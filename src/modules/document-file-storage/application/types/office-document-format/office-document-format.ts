// Danh mục định dạng office được hỗ trợ; storage, tải xuống và editor dùng chung MIME chuẩn.

export const OFFICE_DOCUMENT_FORMATS = {
    docx: {
        extension: 'docx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    pptx: {
        extension: 'pptx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
} as const;

export type OfficeDocumentFormat =
    (typeof OFFICE_DOCUMENT_FORMATS)[keyof typeof OFFICE_DOCUMENT_FORMATS];
export type OfficeDocumentExtension = keyof typeof OFFICE_DOCUMENT_FORMATS;

// Chỉ nhận DOCX/PPTX đã biết để metadata lạ không được phát hành dưới dạng download hợp lệ.
export function getOfficeDocumentFormat(
    mimeType: string,
): OfficeDocumentFormat | null {
    return (
        Object.values(OFFICE_DOCUMENT_FORMATS).find(
            (format) => format.mimeType === mimeType,
        ) ?? null
    );
}

// Nhận diện định dạng từ phần mở rộng đã được chuẩn hóa bởi controller hoặc storage adapter.
export function getOfficeDocumentFormatByExtension(
    extension: string,
): OfficeDocumentFormat | null {
    return (
        Object.values(OFFICE_DOCUMENT_FORMATS).find(
            (format) => format.extension === extension.toLowerCase(),
        ) ?? null
    );
}
