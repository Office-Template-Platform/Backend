// Lỗi 500 đã làm sạch khi copy PPTX hoặc commit metadata bản sao bị thất bại.
import { InternalServerErrorException } from '@nestjs/common';

// Nguyên nhân filesystem/database chỉ được log ở server, response không tiết lộ chi tiết storage.
export class PresentationCreationFailedError extends InternalServerErrorException {
    // Giữ thông báo ổn định để client có thể hướng dẫn người dùng thử lại.
    constructor() {
        super('Không thể tạo bản trình chiếu từ mẫu đã chọn.');
    }
}
