// Lỗi application đã được làm sạch khi thao tác copy/commit tài liệu thất bại.
import { InternalServerErrorException } from '@nestjs/common';

// Lỗi filesystem hoặc SQL gốc chỉ được log ở server, không trả chi tiết cho client.
export class UserDocumentCreationFailedError extends InternalServerErrorException {
    // Giữ hợp đồng response ổn định dù nguyên nhân nội bộ thay đổi.
    constructor() {
        super('Không thể tạo tài liệu từ mẫu đã chọn.');
    }
}
