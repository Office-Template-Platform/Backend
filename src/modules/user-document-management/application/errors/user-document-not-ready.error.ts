// Lỗi application khi tài liệu đang tạo hoặc thiếu file đầu ra nên chưa thể đọc/tải/lưu.
import { ConflictException } from '@nestjs/common';

// HTTP 409 báo client rằng tài nguyên có thật nhưng chưa đạt trạng thái cho phép thao tác file.
export class UserDocumentNotReadyError extends ConflictException {
    // Thông báo dành cho tải xuống; use case lưu nội dung có thể truyền nội dung cụ thể hơn.
    constructor(message = 'Tài liệu chưa sẵn sàng để tải xuống.') {
        super(message);
    }
}
