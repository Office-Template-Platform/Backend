// Lỗi application cho mẫu đã đọc được nhưng không có ảnh preview hiện hành.
import { NotFoundException } from '@nestjs/common';

// Dùng thông điệp riêng để client phân biệt ảnh preview thiếu với metadata mẫu không tồn tại.
export class DocumentTemplatePreviewNotFoundError extends NotFoundException {
    // Giữ thông báo ổn định cho endpoint stream ảnh.
    constructor() {
        super('Không tìm thấy ảnh xem trước của mẫu văn bản.');
    }
}
