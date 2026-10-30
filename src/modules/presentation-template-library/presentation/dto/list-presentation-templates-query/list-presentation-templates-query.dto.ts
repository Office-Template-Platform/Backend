// Query contract của catalog PPTX; kiểm tra UUID trước khi categoryId tới TypeORM.
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListPresentationTemplatesQueryDto {
    // Trim search ở HTTP boundary để service không nhận filter chỉ có whitespace.
    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    search?: string;

    @IsOptional()
    @IsUUID('4')
    categoryId?: string;
}
