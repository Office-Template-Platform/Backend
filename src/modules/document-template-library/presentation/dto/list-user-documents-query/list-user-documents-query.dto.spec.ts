// Nhóm unit test cho ListUserDocumentsQueryDto: kiểm tra mặc định, chuyển kiểu query string và giới hạn đầu vào.
// | STT | Test case       | Mục đích                              | Các bước làm                                | Kết quả mong đợi                    |
// |-----|-----------------|---------------------------------------|---------------------------------------------|-------------------------------------|
// | 1   | Không truyền    | Có page và limit mặc định             | Chuyển object rỗng; validate DTO             | page 1, limit 12, không có lỗi      |
// | 2   | Query hợp lệ    | Chuyển page/limit dạng chuỗi thành số | Chuyển query string; validate DTO            | Số được chuyển kiểu, không có lỗi   |
// | 3   | Ngoài giới hạn  | Chặn page/limit/search không hợp lệ   | Truyền giá trị vượt ràng buộc; validate DTO | Có lỗi đúng từng thuộc tính         |

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { ListUserDocumentsQueryDto } from '@/modules/document-template-library/presentation/dto/list-user-documents-query/list-user-documents-query.dto';

describe('ListUserDocumentsQueryDto', () => {
    // Test 1 giữ API dễ gọi khi chưa yêu cầu phân trang cụ thể.
    it('should apply default page and limit values', async () => {
        // Bước 1 - Arrange: chuyển query rỗng qua cùng mapper mà ValidationPipe dùng.
        const query = plainToInstance(ListUserDocumentsQueryDto, {});

        // Bước 2 - Act: xác thực các giá trị mặc định của DTO.
        const errors = await validate(query);

        // Bước 3 - Assert: query rỗng hợp lệ và dùng trang đầu với 12 kết quả.
        expect(query.page).toBe(1);
        expect(query.limit).toBe(12);
        expect(errors).toHaveLength(0);
    });

    // Test 2 bảo đảm query parameter dạng chuỗi được chuyển thành number trước khi vào use case.
    it('should transform valid numeric query strings', async () => {
        // Bước 1 - Arrange: browser gửi page và limit theo dạng chuỗi URL thông thường.
        const query = plainToInstance(ListUserDocumentsQueryDto, {
            page: '3',
            limit: '25',
            search: 'Báo cáo',
        });

        // Bước 2 - Act: chạy các ràng buộc đầu vào trên DTO đã chuyển kiểu.
        const errors = await validate(query);

        // Bước 3 - Assert: service nhận số nguyên và chuỗi tìm kiếm trong giới hạn.
        expect(query.page).toBe(3);
        expect(query.limit).toBe(25);
        expect(errors).toHaveLength(0);
    });

    // Test 3 giới hạn chi phí truy vấn và kích thước search ngay tại boundary HTTP.
    it('should reject out-of-range pagination and oversized search values', async () => {
        // Bước 1 - Arrange: request gửi số trang phân số, limit quá lớn và search quá dài.
        const query = plainToInstance(ListUserDocumentsQueryDto, {
            page: '1.5',
            limit: '101',
            search: 'x'.repeat(201),
        });

        // Bước 2 - Act: xác thực DTO như global ValidationPipe.
        const errors = await validate(query);

        // Bước 3 - Assert: chỉ các thuộc tính sai bị báo lỗi, query không được thực thi.
        expect(errors.map((error) => error.property).sort()).toEqual([
            'limit',
            'page',
            'search',
        ]);
    });
});
