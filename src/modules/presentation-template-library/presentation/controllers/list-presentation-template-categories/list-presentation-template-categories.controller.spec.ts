// Nhóm unit test cho ListPresentationTemplateCategoriesController: kiểm tra endpoint chuyển lời gọi tới category service.
// | STT | Test case       | Mục đích                 | Các bước làm                      | Kết quả mong đợi                  |
// |-----|-----------------|--------------------------|-----------------------------------|-----------------------------------|
// | 1   | Có danh mục     | Trả category read model   | Gọi controller; service trả list  | Trả đúng list và gọi service một lần |

import { ListPresentationTemplateCategoriesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-template-categories/list-presentation-template-categories.service';
import { ListPresentationTemplateCategoriesController } from '@/modules/presentation-template-library/presentation/controllers/list-presentation-template-categories/list-presentation-template-categories.controller';

describe('ListPresentationTemplateCategoriesController', () => {
    it('should return categories from the application service', async () => {
        // Bước 1 - Arrange: service trả category cùng số lượng mẫu PPTX.
        const categories = [
            { id: 'category-1', name: 'Kinh doanh', templateCount: 6 },
        ];
        const execute = jest.fn().mockResolvedValue(categories);
        const service = {
            execute,
        } as unknown as ListPresentationTemplateCategoriesService;
        const target = new ListPresentationTemplateCategoriesController(
            service,
        );

        // Bước 2 - Act: gọi endpoint method để lấy danh mục.
        const response = await target.list();

        // Bước 3 - Assert: controller chỉ chuyển tiếp read model.
        expect(response).toBe(categories);
        expect(execute.mock.calls).toHaveLength(1);
    });
});
