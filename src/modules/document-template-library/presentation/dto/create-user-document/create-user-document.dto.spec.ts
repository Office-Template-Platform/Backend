// Nhóm unit test cho CreateUserDocumentDto: kiểm tra title tùy chọn, trim và giới hạn độ dài.
// | STT | Test case        | Mục đích                         | Các bước làm                          | Kết quả mong đợi                    |
// |-----|------------------|----------------------------------|---------------------------------------|-------------------------------------|
// | 1   | Title có spaces | Chuẩn hóa title trước khi lưu     | Transform rồi validate                | Title được trim, không có lỗi       |
// | 2   | Không gửi title | Hỗ trợ tên mẫu mặc định           | Transform object rỗng rồi validate    | Không có lỗi                        |
// | 3   | Title trắng     | Chặn dữ liệu chỉ có khoảng trắng  | Trim thành rỗng rồi validate          | Lỗi minLength ở field title         |
// | 4   | Title quá dài   | Tôn trọng giới hạn database       | Gửi 201 ký tự rồi validate            | Lỗi maxLength ở field title         |
// | 5   | Title sai kiểu  | Không ép kiểu tùy tiện            | Gửi number rồi validate               | Lỗi isString ở field title          |
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDocumentDto } from '@/modules/document-template-library/presentation/dto/create-user-document/create-user-document.dto';

describe('CreateUserDocumentDto', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận title được trim trước khi use case lưu metadata.
    it('should trim a supplied title before validation', async () => {
        // Bước 1 - Arrange: tạo DTO từ request có spaces ở hai đầu title.
        const dto = plainToInstance(CreateUserDocumentDto, {
            title: '  My Resume  ',
        });

        // Bước 2 - Act: chạy các validator áp dụng trên DTO đã transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: title chuẩn hóa còn hợp lệ và không sinh lỗi.
        expect(dto.title).toBe('My Resume');
        expect(errors).toEqual([]);
    });

    // Test 2 title là tùy chọn để service dùng tên template khi client bỏ qua.
    it('should accept an omitted title', async () => {
        // Bước 1 - Arrange: request không có field title.
        const dto = plainToInstance(CreateUserDocumentDto, {});

        // Bước 2 - Act: validate object sau class-transformer.
        const errors = await validate(dto);

        // Bước 3 - Assert: không tự tạo title và không báo lỗi required.
        expect(dto.title).toBeUndefined();
        expect(errors).toEqual([]);
    });

    // Test 3 spaces-only bị trim thành empty rồi fail minimum length.
    it('should reject a title that becomes empty after trimming', async () => {
        // Bước 1 - Arrange: title chỉ gồm whitespace.
        const dto = plainToInstance(CreateUserDocumentDto, { title: '   ' });

        // Bước 2 - Act: chạy validation trên giá trị đã chuẩn hóa.
        const errors = await validate(dto);

        // Bước 3 - Assert: title rỗng bị từ chối tại ranh giới request.
        expect(dto.title).toBe('');
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('title');
        expect(errors[0]?.constraints).toHaveProperty('minLength');
    });

    // Test 4 chặn title dài hơn 200 ký tự để không vượt cột database.
    it('should reject a title longer than the database column limit', async () => {
        // Bước 1 - Arrange: gửi title dài hơn giới hạn 200 ký tự.
        const dto = plainToInstance(CreateUserDocumentDto, {
            title: 'A'.repeat(201),
        });

        // Bước 2 - Act: validate title đã transform.
        const errors = await validate(dto);

        // Bước 3 - Assert: maxLength báo lỗi rõ ở field title.
        expect(errors).toHaveLength(1);
        expect(errors[0]?.property).toBe('title');
        expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });

    // Test 5 không biến number thành string vì request phải tuân theo JSON contract.
    it('should reject a non-string title without coercing it', async () => {
        // Bước 1 - Arrange: request truyền kiểu number thay vì string.
        const dto = plainToInstance(CreateUserDocumentDto, { title: 123 });

        // Bước 2 - Act: chạy validator sau transform không ép kiểu.
        const errors = await validate(dto);

        // Bước 3 - Assert: class-validator báo field type sai.
        expect(dto.title).toBe(123);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('isString');
    });
});
