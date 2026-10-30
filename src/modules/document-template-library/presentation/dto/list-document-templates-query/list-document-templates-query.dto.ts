// DTO xác thực bộ lọc trước khi request đi vào application use case.
import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

// Query contract chặn page quá lớn và chuẩn hóa search/featured trước khi vào use case.
export class ListDocumentTemplatesQueryDto {
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
    @Transform((params) => {
        const value: unknown = params.value;
        return typeof value === 'string' ? value.trim() : value;
    })
    @IsString()
    @MaxLength(120)
    search?: string;

    @IsOptional()
    @IsUUID('4')
    categoryId?: string;

    @IsOptional()
    @Transform((params) => {
        const value: unknown = params.value;
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        return value;
    })
    @IsBoolean()
    featured?: boolean;
}
