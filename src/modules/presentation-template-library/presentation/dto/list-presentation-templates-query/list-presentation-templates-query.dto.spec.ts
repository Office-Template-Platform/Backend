// Nhóm unit test cho ListPresentationTemplatesQueryDto: xác nhận search được trim và categoryId tuân theo UUID v4.
// | STT | Test case           | Mục đích                           | Các bước làm                          | Kết quả mong đợi                       |
// |-----|---------------------|------------------------------------|---------------------------------------|----------------------------------------|
// | 1   | Query hợp lệ        | Chuẩn hóa search/filter            | Transform query; validate             | Search trim, UUID hợp lệ               |
// | 2   | Search chỉ khoảng trắng | Bỏ filter vô nghĩa             | Transform query; validate             | Search rỗng, DTO hợp lệ                |
// | 3   | Category sai UUID   | Chặn filter sai format trước SQL   | Gửi categoryId sai; validate          | Báo lỗi isUuid                         |
// | 4   | Search quá dài      | Giới hạn query tối đa 120 ký tự    | Gửi 121 ký tự; validate               | Báo lỗi maxLength                      |

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPresentationTemplatesQueryDto } from '@/modules/presentation-template-library/presentation/dto/list-presentation-templates-query/list-presentation-templates-query.dto';

describe('ListPresentationTemplatesQueryDto', () => {
    afterEach(() => jest.clearAllMocks());

    // Test 1 kiểm tra query string được chuẩn hóa mà không đổi UUID filter.
    it('should trim search and accept a valid category UUID', async () => {
        // Bước 1 - Arrange: query có whitespace ở search và UUID v4 hợp lệ.
        const dto = plainToInstance(ListPresentationTemplatesQueryDto, {
            search: '  trình chiếu  ',
            categoryId: '550e8400-e29b-41d4-a716-446655440000',
        });

        // Bước 2 - Act: kiểm tra DTO đã transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: search được trim, category vẫn giữ nguyên.
        expect(dto.search).toBe('trình chiếu');
        expect(dto.categoryId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(errors).toEqual([]);
    });

    // Test 2 để chuỗi whitespace không trở thành điều kiện search rộng ngoài ý muốn.
    it('should normalize a whitespace-only search to an empty optional value', async () => {
        // Bước 1 - Arrange: người dùng gửi search chỉ có khoảng trắng.
        const dto = plainToInstance(ListPresentationTemplatesQueryDto, {
            search: '   ',
        });

        // Bước 2 - Act: transform và validate filter tùy chọn.
        const errors = await validate(dto);

        // Bước 3 - Assert: DTO hợp lệ và reader có thể bỏ qua chuỗi rỗng.
        expect(dto.search).toBe('');
        expect(errors).toEqual([]);
    });

    // Test 3 chặn chuỗi category không phải UUID trước khi repository nhận filter.
    it('should reject a category ID that is not a UUID v4', async () => {
        // Bước 1 - Arrange: gửi slug thay cho UUID.
        const dto = plainToInstance(ListPresentationTemplatesQueryDto, {
            categoryId: 'business',
        });

        // Bước 2 - Act: chạy validator UUID.
        const errors = await validate(dto);

        // Bước 3 - Assert: lỗi định dạng thuộc field categoryId.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('categoryId');
        expect(errors[0]?.constraints).toHaveProperty('isUuid');
    });

    // Test 4 giới hạn search để tránh query không cần thiết quá dài.
    it('should reject a search longer than 120 characters', async () => {
        // Bước 1 - Arrange: gửi term dài hơn giới hạn một ký tự.
        const dto = plainToInstance(ListPresentationTemplatesQueryDto, {
            search: 'x'.repeat(121),
        });

        // Bước 2 - Act: validate độ dài query.
        const errors = await validate(dto);

        // Bước 3 - Assert: maxLength báo lỗi trên search.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });
});
