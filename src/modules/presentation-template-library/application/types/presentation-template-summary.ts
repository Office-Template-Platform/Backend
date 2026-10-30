// Read model công khai cho catalog trình chiếu; không chứa storage key hoặc bytes của PPTX.
export type PresentationTemplateSummary = {
    id: string;
    name: string;
    category: string;
    description: string;
    previewUrl: string | null;
    slideCount: number;
};

// Category dùng cho bộ lọc catalog và chỉ đếm mẫu trình chiếu đã xuất bản.
export type PresentationTemplateCategory = {
    id: string;
    name: string;
    slug: string;
    templateCount: number;
};

// Một ảnh xem trước thuộc đúng vị trí slide của phiên bản hiện hành.
export type PresentationSlidePreviewSummary = {
    slideNumber: number;
    title: string | null;
    previewUrl: string;
};

// Detail bổ sung slug, category ID và các slide preview nhưng vẫn giữ metadata list.
export type PresentationTemplateDetail = PresentationTemplateSummary & {
    slug: string;
    categoryId: string;
    slides: PresentationSlidePreviewSummary[];
    createdAt: string;
    updatedAt: string;
};
