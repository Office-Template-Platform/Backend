// Nhóm unit test cho ListPresentationTemplatesController: xác nhận query DTO được chuyển nguyên vẹn sang use case.
// | STT | Test case        | Mục đích                     | Các bước làm                         | Kết quả mong đợi                  |
// |-----|------------------|------------------------------|--------------------------------------|-----------------------------------|
// | 1   | Query có filter  | Chuyển search/category       | Gọi controller với DTO và mock service | Trả kết quả service, truyền DTO   |

import { ListPresentationTemplatesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-templates/list-presentation-templates.service';
import { ListPresentationTemplatesController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/list-presentation-templates/list-presentation-templates.controller';
import { ListPresentationTemplatesQueryDto } from '@/modules/presentation-template-library/presentation/dto/list-presentation-templates-query/list-presentation-templates-query.dto';

describe('ListPresentationTemplatesController', () => {
    it('should pass the validated query to the list service', async () => {
        // Bước 1 - Arrange: service mock trả list và DTO đã qua ValidationPipe.
        const result = [{ id: 'template-1', name: 'Deck' }];
        const execute = jest.fn().mockResolvedValue(result);
        const service = {
            execute,
        } as unknown as ListPresentationTemplatesService;
        const target = new ListPresentationTemplatesController(service);
        const query = Object.assign(new ListPresentationTemplatesQueryDto(), {
            search: 'Deck',
            categoryId: 'category-1',
        });

        // Bước 2 - Act: controller nhận query và gọi service.
        const response = await target.list(query);

        // Bước 3 - Assert: response và đối số không bị controller sửa đổi.
        expect(response).toBe(result);
        expect(execute.mock.calls).toEqual([[query]]);
    });
});
