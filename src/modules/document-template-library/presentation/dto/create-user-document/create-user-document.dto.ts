// DTO giới hạn tiêu đề đầu ra; bỏ khoảng trắng ngoài trước khi lưu vào database.
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Request tạo bản sao chỉ nhận title tùy chọn; nội dung lấy từ file mẫu đã chọn.
export class CreateUserDocumentDto {
    @IsOptional()
    @Transform((params) => {
        const value: unknown = params.value;
        return typeof value === 'string' ? value.trim() : value;
    })
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title?: string;
}
