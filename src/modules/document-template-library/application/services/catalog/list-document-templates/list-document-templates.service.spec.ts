// Nhóm unit test cho ListDocumentTemplatesService: xác nhận filter được chuyển nguyên vẹn và metadata phân trang không bị thay đổi.
// | STT | Test case      | Mục đích                        | Các bước làm                                | Kết quả mong đợi                    |
// |-----|----------------|---------------------------------|---------------------------------------------|-------------------------------------|
// | 1   | Trang có mẫu   | Trả kết quả theo filter yêu cầu | Reader trả page; gọi execute với filters    | Trả page và gọi reader đúng một lần |
// | 2   | Trang rỗng     | Giữ metadata khi không khớp mẫu | Reader trả items=[] và total=0; gọi execute | Trả trang rỗng với totalPages=0     |
// | 3   | Reader gặp lỗi | Không che lỗi persistence       | Reader reject; gọi execute                  | Lỗi gốc được truyền lên             |

import type {
    DocumentTemplateFilters,
    DocumentTemplateReaderContract,
    PagedDocumentTemplates,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';

describe('ListDocumentTemplatesService', () => {
    let target: ListDocumentTemplatesService;
    let mockTemplateReader: jest.Mocked<DocumentTemplateReaderContract>;

    beforeEach(() => {
        mockTemplateReader = {
            list: jest.fn(),
            listCategories: jest.fn(),
            findPublishedById: jest.fn(),
            findCurrentPreview: jest.fn(),
            findCurrentSource: jest.fn(),
        };
        target = new ListDocumentTemplatesService(mockTemplateReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 kiểm tra filter search/category/featured được chuyển nguyên vẹn sang contract.
    it('should return the requested template page when templates exist', async () => {
        // Bước 1 - Arrange: chuẩn bị filter và trang mẫu có đủ metadata phân trang.
        const filters: DocumentTemplateFilters = {
            page: 2,
            limit: 8,
            search: 'resume',
            categoryId: 'category-1',
            featured: false,
        };
        const expected: PagedDocumentTemplates = {
            items: [
                {
                    id: 'template-1',
                    slug: 'resume',
                    name: 'Resume',
                    description: null,
                    category: {
                        id: 'category-1',
                        name: 'Career',
                        slug: 'career',
                    },
                    isFeatured: false,
                    currentVersion: 1,
                    previewUrl: null,
                },
            ],
            total: 9,
            page: 2,
            limit: 8,
            totalPages: 2,
        };
        mockTemplateReader.list.mockResolvedValue(expected);

        // Bước 2 - Act: gọi use case với bộ lọc đã được DTO xác thực.
        const result = await target.execute(filters);

        // Bước 3 - Assert: response giữ nguyên dữ liệu và filter chỉ được gửi một lần.
        expect(result).toEqual(expected);
        expect(mockTemplateReader.list.mock.calls).toEqual([[filters]]);
        expect(mockTemplateReader.list.mock.calls).toHaveLength(1);
    });

    // Test 2 bảo đảm catalog rỗng vẫn trả đủ pagination thay vì bị chuyển thành lỗi.
    it('should preserve empty page metadata when no templates match', async () => {
        // Bước 1 - Arrange: reader trả trang hợp lệ nhưng không có mẫu.
        const filters: DocumentTemplateFilters = { page: 1, limit: 12 };
        const expected: PagedDocumentTemplates = {
            items: [],
            total: 0,
            page: 1,
            limit: 12,
            totalPages: 0,
        };
        mockTemplateReader.list.mockResolvedValue(expected);

        // Bước 2 - Act: yêu cầu trang đầu không có filter bổ sung.
        const result = await target.execute(filters);

        // Bước 3 - Assert: trạng thái rỗng cùng metadata phân trang được giữ nguyên.
        expect(result).toEqual(expected);
        expect(mockTemplateReader.list.mock.calls).toEqual([[filters]]);
    });

    // Test 3 bảo đảm lỗi truy vấn không bị service biến thành kết quả rỗng hoặc lỗi khác.
    it('should propagate reader failures without changing the error', async () => {
        // Bước 1 - Arrange: giả lập lỗi database từ adapter.
        const failure = new Error('database unavailable');
        mockTemplateReader.list.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: use case reject đúng object lỗi gốc.
        await expect(target.execute({ page: 1, limit: 12 })).rejects.toBe(
            failure,
        );
        expect(mockTemplateReader.list.mock.calls).toHaveLength(1);
    });
});
