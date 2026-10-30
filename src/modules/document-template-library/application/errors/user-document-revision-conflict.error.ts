// Lỗi application khi callback lưu thuộc revision cũ hơn file hiện đang được tham chiếu.
import { ConflictException } from '@nestjs/common';

// HTTP 409 cho phép callback stale được nhận diện riêng, không ghi đè nội dung mới hơn.
export class UserDocumentRevisionConflictError extends ConflictException {
    // Dùng cùng status cho callback và luồng application cần kiểm tra cập nhật cạnh tranh.
    constructor() {
        super('Tài liệu đã có revision mới hơn.');
    }
}
