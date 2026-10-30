// Nhóm unit test cho ListDocumentTemplateCategoriesController: xác nhận endpoint danh mục ủy quyền response cho use case.
// | STT | Test case   | Mục đích                       | Các bước làm                        | Kết quả mong đợi                       |
// |-----|-------------|--------------------------------|-------------------------------------|----------------------------------------|
// | 1   | Có danh mục | Trả danh mục và template count | Gọi list; service trả category list | Controller trả nguyên kết quả use case |

import { ListDocumentTemplateCategoriesService } from '@/modules/document-template-library/application/services/catalog/list-document-template-categories/list-document-template-categories.service';
import { ListDocumentTemplateCategoriesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-template-categories/list-document-template-categories.controller';

describe('ListDocumentTemplateCategoriesController', () => {
    let target: ListDocumentTemplateCategoriesController;
    let mockListCategories: jest.Mocked<
        Pick<ListDocumentTemplateCategoriesService, 'execute'>
    >;

    beforeEach(() => {
        mockListCategories = { execute: jest.fn() };
        target = new ListDocumentTemplateCategoriesController(
            mockListCategories as unknown as ListDocumentTemplateCategoriesService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận endpoint danh mục trả cùng dữ liệu được use case cung cấp.
    it('should return the category list from its use case', async () => {
        // Bước 1 - Arrange: use case chuẩn bị danh mục cùng số mẫu đã xuất bản.
        const expected = [
            {
                id: 'category-1',
                name: 'Career',
                slug: 'career',
                templateCount: 4,
            },
        ];
        mockListCategories.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi endpoint GET /document-templates/categories.
        const result = await target.list();

        // Bước 3 - Assert: giữ nguyên payload và gọi use case một lần.
        expect(result).toEqual(expected);
        expect(mockListCategories.execute.mock.calls).toEqual([[]]);
    });
});
