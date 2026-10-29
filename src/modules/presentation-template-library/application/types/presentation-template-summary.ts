// Hợp đồng metadata của bộ mẫu trình chiếu; không chứa file PPTX gốc.
export type PresentationTemplateSummary = {
    id: string;
    name: string;
    category: string;
    description: string;
    previewUrl: string | null;
    slideCount: number;
};
