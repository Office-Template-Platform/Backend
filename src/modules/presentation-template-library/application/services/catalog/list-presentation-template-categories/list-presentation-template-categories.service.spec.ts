// Nhóm unit test cho ListPresentationTemplateCategoriesService: kiểm tra danh mục và lỗi từ reader.
// | STT | Test case       | Mục đích                       | Các bước làm                     | Kết quả mong đợi               |
// |-----|-----------------|--------------------------------|----------------------------------|--------------------------------|
// | 1   | Có danh mục     | Trả danh mục PPTX public        | Reader trả danh mục; gọi execute | Trả đúng danh mục/count        |
// | 2   | Reader lỗi      | Giữ lỗi đọc danh mục            | Reader reject; gọi execute       | Lỗi gốc được truyền lên        |

import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { ListPresentationTemplateCategoriesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-template-categories/list-presentation-template-categories.service';

describe('ListPresentationTemplateCategoriesService', () => {
    let target: ListPresentationTemplateCategoriesService;
    let reader: jest.Mocked<
        Pick<PresentationTemplateReaderContract, 'listCategories'>
    >;

    beforeEach(() => {
        reader = { listCategories: jest.fn() };
        target = new ListPresentationTemplateCategoriesService(reader);
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 kiểm tra service trả category count từ reader mà không tự đếm lại.
    it('should return the presentation categories from the reader', async () => {
        // Bước 1 - Arrange: reader cung cấp một category có hai mẫu public.
        const expected = [
            {
                id: 'category-1',
                name: 'Kinh doanh',
                slug: 'kinh-doanh',
                templateCount: 2,
            },
        ];
        reader.listCategories.mockResolvedValue(expected);

        // Bước 2 - Act: yêu cầu danh mục cho bộ lọc catalog.
        const result = await target.execute();

        // Bước 3 - Assert: danh mục và số lượng được trả nguyên trạng.
        expect(result).toEqual(expected);
        expect(reader.listCategories.mock.calls).toHaveLength(1);
    });

    // Test 2 đảm bảo lỗi truy vấn được chuyển lên thay vì giả làm danh mục rỗng.
    it('should propagate reader errors unchanged', async () => {
        // Bước 1 - Arrange: reader lỗi khi truy vấn PostgreSQL.
        const failure = new Error('database unavailable');
        reader.listCategories.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: caller nhận đúng lỗi gốc.
        await expect(target.execute()).rejects.toBe(failure);
    });
});
