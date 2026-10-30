// Nhóm unit test cho CreateUserPresentationDto: kiểm tra title tùy chọn, chuẩn hóa khoảng trắng và giới hạn database.
// | STT | Test case             | Mục đích                         | Các bước làm                        | Kết quả mong đợi                       |
// |-----|-----------------------|----------------------------------|-------------------------------------|----------------------------------------|
// | 1   | Title hợp lệ          | Trim trước khi lưu               | Transform title; validate           | Title được trim, không có lỗi          |
// | 2   | Bỏ qua title          | Dùng tên mẫu mặc định            | Transform object rỗng; validate      | DTO hợp lệ, title undefined            |
// | 3   | Title chỉ có khoảng trắng | Từ chối tên trống             | Transform title; validate           | Báo lỗi minLength                      |
// | 4   | Title quá dài         | Không vượt cột 200 ký tự         | Gửi title 201 ký tự; validate        | Báo lỗi maxLength                      |

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserPresentationDto } from '@/modules/presentation-template-library/presentation/dto/create-user-presentation/create-user-presentation.dto';

describe('CreateUserPresentationDto', () => {
    afterEach(() => jest.clearAllMocks());

    // Test 1 chuẩn hóa title trước khi controller chuyển giá trị cho use case.
    it('should trim a supplied title', async () => {
        // Bước 1 - Arrange: request có khoảng trắng ở hai đầu tên.
        const dto = plainToInstance(CreateUserPresentationDto, {
            title: '  Bài trình chiếu  ',
        });

        // Bước 2 - Act: validate DTO sau class-transformer.
        const errors = await validate(dto);

        // Bước 3 - Assert: giá trị đã trim và hợp lệ.
        expect(dto.title).toBe('Bài trình chiếu');
        expect(errors).toEqual([]);
    });

    // Test 2 cho phép bỏ title để service dùng tên bộ mẫu nguồn.
    it('should accept an omitted title', async () => {
        // Bước 1 - Arrange: body không truyền trường title.
        const dto = plainToInstance(CreateUserPresentationDto, {});

        // Bước 2 - Act: chạy validation trên body rỗng.
        const errors = await validate(dto);

        // Bước 3 - Assert: title vẫn optional.
        expect(dto.title).toBeUndefined();
        expect(errors).toEqual([]);
    });

    // Test 3 từ chối title rỗng sau chuẩn hóa để không tạo tên file thiếu nội dung.
    it('should reject a title that becomes empty after trimming', async () => {
        // Bước 1 - Arrange: title chỉ gồm whitespace.
        const dto = plainToInstance(CreateUserPresentationDto, {
            title: '   ',
        });

        // Bước 2 - Act: transform rồi validate giá trị đã chuẩn hóa.
        const errors = await validate(dto);

        // Bước 3 - Assert: ràng buộc minLength chặn tên rỗng.
        expect(dto.title).toBe('');
        expect(errors[0]?.constraints).toHaveProperty('minLength');
    });

    // Test 4 giữ title trong giới hạn varchar(200) của user_documents.
    it('should reject a title longer than 200 characters', async () => {
        // Bước 1 - Arrange: request gửi title vượt giới hạn cột một ký tự.
        const dto = plainToInstance(CreateUserPresentationDto, {
            title: 'A'.repeat(201),
        });

        // Bước 2 - Act: validate độ dài sau transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: maxLength gắn lỗi đúng field title.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('title');
        expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });
});
