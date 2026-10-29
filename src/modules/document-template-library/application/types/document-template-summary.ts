// Hợp đồng metadata của mẫu văn bản, không chứa file DOCX hay dữ liệu persistence.
export type DocumentTemplateSummary = {
    id: string;
    name: string;
    category: string;
    description: string;
    previewUrl: string | null;
};
