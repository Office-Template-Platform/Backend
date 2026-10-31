// Nhóm unit test cho CreateUserPresentationController: xác nhận title và workspace được chuyển đúng sang use case.
// | STT | Test case      | Mục đích                       | Các bước làm                               | Kết quả mong đợi                  |
// |-----|----------------|--------------------------------|--------------------------------------------|-----------------------------------|
// | 1   | Tạo bản sao    | Ràng buộc bản sao vào workspace | Gọi controller với ID/workspace/body       | Service nhận đủ ba đối số         |

import { CreateUserPresentationService } from '@/modules/presentation-template-library/application/services/user-presentations/create-user-presentation/create-user-presentation.service';
import { CreateUserPresentationController } from '@/modules/presentation-template-library/presentation/controllers/create-user-presentation/create-user-presentation.controller';
import { CreateUserPresentationDto } from '@/modules/presentation-template-library/presentation/dto/create-user-presentation/create-user-presentation.dto';

describe('CreateUserPresentationController', () => {
    it('should pass template, workspace and optional title to the service', async () => {
        // Bước 1 - Arrange: chuẩn bị service và body đã qua validation.
        const summary = { id: 'document-1', status: 'ready' };
        const execute = jest.fn().mockResolvedValue(summary);
        const service = {
            execute,
        } as unknown as CreateUserPresentationService;
        const target = new CreateUserPresentationController(service);
        const body = Object.assign(new CreateUserPresentationDto(), {
            title: 'Bài trình chiếu riêng',
        });

        // Bước 2 - Act: gọi controller method với workspace lấy từ guard/decorator.
        const response = await target.create('template-1', 'workspace-1', body);

        // Bước 3 - Assert: service nhận đúng thông tin đã được xác thực.
        expect(response).toBe(summary);
        expect(execute.mock.calls).toEqual([
            ['template-1', 'workspace-1', 'Bài trình chiếu riêng'],
        ]);
    });
});
