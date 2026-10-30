// Lỗi 404 dùng chung cho mẫu trình chiếu không tồn tại, chưa xuất bản hoặc đã bị ẩn.
import { NotFoundException } from '@nestjs/common';

// Không phân biệt mẫu bị ẩn với ID sai để catalog không làm lộ trạng thái nội bộ.
export class PresentationTemplateNotFoundError extends NotFoundException {
    // Giữ thông báo API ổn định cho cả detail và thao tác tạo bản sao.
    constructor() {
        super('Không tìm thấy bộ mẫu trình chiếu.');
    }
}
