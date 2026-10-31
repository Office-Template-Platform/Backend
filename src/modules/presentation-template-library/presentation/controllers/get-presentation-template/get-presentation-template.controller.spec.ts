// Nhóm unit test cho GetPresentationTemplateController: xác nhận templateId được chuyển tới use case detail.
// | STT | Test case       | Mục đích                  | Các bước làm                      | Kết quả mong đợi                   |
// |-----|-----------------|---------------------------|-----------------------------------|------------------------------------|
// | 1   | ID hợp lệ       | Trả detail mẫu PPTX        | Gọi controller với UUID           | Service nhận đúng ID, detail được trả |

import { GetPresentationTemplateService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template/get-presentation-template.service';
import { GetPresentationTemplateController } from '@/modules/presentation-template-library/presentation/controllers/get-presentation-template/get-presentation-template.controller';

describe('GetPresentationTemplateController', () => {
    it('should pass the template ID to the detail service', async () => {
        // Bước 1 - Arrange: service mock trả metadata detail.
        const detail = { id: 'template-1', name: 'Deck', slides: [] };
        const execute = jest.fn().mockResolvedValue(detail);
        const service = {
            execute,
        } as unknown as GetPresentationTemplateService;
        const target = new GetPresentationTemplateController(service);

        // Bước 2 - Act: controller nhận template ID đã parse thành UUID.
        const response = await target.get('template-1');

        // Bước 3 - Assert: controller trả detail và dùng đúng ID.
        expect(response).toBe(detail);
        expect(execute.mock.calls).toEqual([['template-1']]);
    });
});
