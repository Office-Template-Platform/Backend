// Lỗi 404 khi mẫu công khai không có ảnh thumbnail hoặc ảnh của slide được yêu cầu.
import { NotFoundException } from '@nestjs/common';

// Dùng cùng phản hồi cho preview thiếu và slide không thuộc phiên bản hiện hành.
export class PresentationTemplatePreviewNotFoundError extends NotFoundException {
    // Không trả storage path khi file preview chưa được seed hoặc đã bị gỡ.
    constructor() {
        super('Không tìm thấy ảnh xem trước của bộ mẫu trình chiếu.');
    }
}
