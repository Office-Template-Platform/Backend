// Lỗi application ánh xạ mẫu không tồn tại hoặc chưa được xuất bản thành HTTP 404 ổn định.
import { NotFoundException } from '@nestjs/common';

// Dùng chung cho chi tiết và thao tác tạo tài liệu để không lộ trạng thái nội bộ của mẫu.
export class DocumentTemplateNotFoundError extends NotFoundException {
    // Giữ thông báo tiếng Việt thống nhất tại mọi use case đọc mẫu công khai.
    constructor() {
        super('Không tìm thấy mẫu văn bản.');
    }
}
