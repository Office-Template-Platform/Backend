// Body contract khi tạo bản sao PPTX; title không bắt buộc vì mặc định dùng tên mẫu nguồn.
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserPresentationDto {
    // Chuẩn hóa khoảng trắng trước validation để title rỗng không tạo tên file vô nghĩa.
    @IsOptional()
    @IsString()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @MinLength(1)
    @MaxLength(200)
    title?: string;
}
