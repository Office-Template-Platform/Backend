// Query contract phân trang và tìm kiếm tài liệu thuộc workspace hiện tại.
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class ListUserDocumentsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit = 12;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    search?: string;
}
