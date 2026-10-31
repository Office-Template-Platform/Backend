// Lỗi application cho UUID tài liệu không tìm thấy trong kho tài liệu người dùng.
import { NotFoundException } from '@nestjs/common';

// Dùng chung ở metadata và tải xuống để không phân biệt thông tin nội bộ của bản ghi.
export class UserDocumentNotFoundError extends NotFoundException {
    // Giữ cùng status và message cho mọi use case đọc tài liệu.
    constructor() {
        super('Không tìm thấy tài liệu.');
    }
}
