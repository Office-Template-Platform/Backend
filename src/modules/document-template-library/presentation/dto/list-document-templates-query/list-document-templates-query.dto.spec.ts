// Nhóm unit test cho ListDocumentTemplatesQueryDto: xác nhận query string được transform và chặn tham số vượt contract catalog.
// | STT | Test case               | Mục đích                                   | Các bước làm                                | Kết quả mong đợi                       |
// |-----|-------------------------|--------------------------------------------|---------------------------------------------|----------------------------------------|
// | 1   | Query rỗng              | Dùng pagination mặc định                   | Transform object rỗng; validate             | page=1 và limit=12                     |
// | 2   | Query hợp lệ            | Chuyển số, boolean và chuẩn hóa search     | Gửi query string đầy đủ; transform/validate | Giá trị có kiểu đúng và search đã trim |
// | 3   | Page/limit ngoài ngưỡng | Chặn trang không hợp lệ hoặc limit quá lớn | Gửi page<1, limit<1 hoặc limit>100          | Validation thất bại                    |
// | 4   | Search quá dài          | Giới hạn search tối đa 120 ký tự           | Gửi search dài hơn 120; validate            | Validation thất bại                    |
// | 5   | Boolean sai định dạng   | Chỉ nhận true/false                        | Gửi featured ngoài hai giá trị hợp lệ       | Validation thất bại                    |
// | 6   | Category ID sai UUID    | Chặn filter category không đúng định dạng  | Gửi categoryId không phải UUID v4           | Validation thất bại                    |

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListDocumentTemplatesQueryDto } from '@/modules/document-template-library/presentation/dto/list-document-templates-query/list-document-templates-query.dto';

describe('ListDocumentTemplatesQueryDto', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận query tùy chọn vẫn có page/limit mặc định ổn định.
    it('should use default pagination when query parameters are omitted', async () => {
        // Bước 1 - Arrange: request không gửi filter nào.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {});

        // Bước 2 - Act: validate DTO sau khi class-transformer gán defaults.
        const errors = await validate(dto);

        // Bước 3 - Assert: giá trị mặc định hợp lệ và không có lỗi.
        expect(dto.page).toBe(1);
        expect(dto.limit).toBe(12);
        expect(errors).toEqual([]);
    });

    // Test 2 xác nhận query string được chuyển đúng trước khi service gọi repository.
    it('should transform and validate a complete catalog query', async () => {
        // Bước 1 - Arrange: HTTP query gửi số và boolean dưới dạng chuỗi.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {
            page: '2',
            limit: '24',
            search: '  resume  ',
            categoryId: '550e8400-e29b-41d4-a716-446655440000',
            featured: 'false',
        });

        // Bước 2 - Act: validate các field sau khi transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: số, boolean và search đã được chuẩn hóa.
        expect(dto.page).toBe(2);
        expect(dto.limit).toBe(24);
        expect(dto.search).toBe('resume');
        expect(dto.categoryId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(dto.featured).toBe(false);
        expect(errors).toEqual([]);
    });

    // Test 3 chặn số trang nhỏ hơn 1 và giới hạn lớn hơn 100 trước query database.
    it('should reject page and limit values outside the supported range', async () => {
        // Bước 1 - Arrange: tạo hai giá trị vi phạm range độc lập.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {
            page: '0',
            limit: '101',
        });

        // Bước 2 - Act: validate range sau khi string đã được chuyển thành number.
        const errors = await validate(dto);

        // Bước 3 - Assert: cả page và limit đều có lỗi tương ứng.
        expect(errors.map((error) => error.property).sort()).toEqual([
            'limit',
            'page',
        ]);
        expect(
            errors.find((error) => error.property === 'page')?.constraints,
        ).toHaveProperty('min');
        expect(
            errors.find((error) => error.property === 'limit')?.constraints,
        ).toHaveProperty('max');
    });

    // Test 4 chặn search dài hơn 120 ký tự để bảo vệ query và contract catalog.
    it('should reject a search term longer than 120 characters', async () => {
        // Bước 1 - Arrange: gửi chuỗi vượt độ dài được hỗ trợ.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {
            search: 'r'.repeat(121),
        });

        // Bước 2 - Act: validate chuỗi search.
        const errors = await validate(dto);

        // Bước 3 - Assert: lỗi maxLength gắn vào field search.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('search');
        expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });

    // Test 5 chỉ chấp nhận true/false tường minh, không suy diễn chuỗi khác thành false.
    it('should reject boolean query values other than true or false', async () => {
        // Bước 1 - Arrange: truyền một chuỗi không có mapping boolean.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {
            featured: 'yes',
        });

        // Bước 2 - Act: validator nhận giá trị gốc sau transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: field giữ chuỗi và bị báo isBoolean.
        expect(dto.featured).toBe('yes');
        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('isBoolean');
    });

    // Test 6 UUID category sai định dạng bị từ chối trước khi đi tới query builder.
    it('should reject a category filter that is not a UUID v4', async () => {
        // Bước 1 - Arrange: categoryId không phải UUID.
        const dto = plainToInstance(ListDocumentTemplatesQueryDto, {
            categoryId: 'career',
        });

        // Bước 2 - Act: chạy validation trên filter.
        const errors = await validate(dto);

        // Bước 3 - Assert: categoryId bị đánh dấu sai format UUID.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('categoryId');
        expect(errors[0]?.constraints).toHaveProperty('isUuid');
    });
});
