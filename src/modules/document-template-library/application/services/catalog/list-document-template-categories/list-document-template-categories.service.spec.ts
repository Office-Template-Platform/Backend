// Nhóm unit test cho ListDocumentTemplateCategoriesService: xác nhận service trả danh mục và số mẫu từ reader, đồng thời truyền nguyên lỗi.
// | STT | Test case         | Mục đích                       | Các bước làm                         | Kết quả mong đợi                     |
// |-----|-------------------|--------------------------------|--------------------------------------|--------------------------------------|
// | 1   | Có danh mục       | Trả danh mục kèm số mẫu        | Reader trả các category; gọi execute | Service trả đúng danh sách và counts |
// | 2   | Không có danh mục | Hỗ trợ catalog chưa có dữ liệu | Reader trả []; gọi execute           | Service trả []                       |
// | 3   | Reader gặp lỗi    | Giữ nguyên lỗi đọc danh mục    | Reader reject; gọi execute           | Lỗi gốc được truyền lên              |

import type { DocumentTemplateReaderContract } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';

describe('ListDocumentTemplateCategoriesService', () => {
    let target: ListDocumentTemplateCategoriesService;
    let mockTemplateReader: jest.Mocked<DocumentTemplateReaderContract>;

    beforeEach(() => {
        mockTemplateReader = {
            list: jest.fn(),
            listCategories: jest.fn(),
            findPublishedById: jest.fn(),
            findCurrentPreview: jest.fn(),
            findCurrentSource: jest.fn(),
        };
        target = new ListDocumentTemplateCategoriesService(mockTemplateReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận số lượng mẫu và thứ tự từ adapter không bị application thay đổi.
    it('should return active categories with template counts', async () => {
        // Bước 1 - Arrange: chuẩn bị category đã được adapter đếm trong PostgreSQL.
        const expected = [
            {
                id: 'category-1',
                name: 'Career',
                slug: 'career',
                templateCount: 5,
            },
        ];
        mockTemplateReader.listCategories.mockResolvedValue(expected);

        // Bước 2 - Act: lấy danh mục để frontend hiển thị bộ lọc.
        const result = await target.execute();

        // Bước 3 - Assert: trả nguyên danh sách và gọi contract đúng một lần.
        expect(result).toEqual(expected);
        expect(mockTemplateReader.listCategories.mock.calls).toHaveLength(1);
    });

    // Test 2 xác nhận trạng thái chưa có category là danh sách rỗng hợp lệ.
    it('should return an empty list when there are no active categories', async () => {
        // Bước 1 - Arrange: reader trả danh sách rỗng.
        mockTemplateReader.listCategories.mockResolvedValue([]);

        // Bước 2 - Act: gọi use case.
        const result = await target.execute();

        // Bước 3 - Assert: client nhận [] thay vì null hoặc exception.
        expect(result).toEqual([]);
        expect(mockTemplateReader.listCategories.mock.calls).toHaveLength(1);
    });

    // Test 3 xác nhận lỗi database được chuyển tiếp để exception filter xử lý ở HTTP boundary.
    it('should propagate reader failures without changing the error', async () => {
        // Bước 1 - Arrange: adapter từ chối do database lỗi.
        const failure = new Error('database unavailable');
        mockTemplateReader.listCategories.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: không nuốt lỗi truy vấn.
        await expect(target.execute()).rejects.toBe(failure);
        expect(mockTemplateReader.listCategories.mock.calls).toHaveLength(1);
    });
});
