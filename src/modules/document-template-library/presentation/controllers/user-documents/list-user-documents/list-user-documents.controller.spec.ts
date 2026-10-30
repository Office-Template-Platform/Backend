// Nhóm unit test cho ListUserDocumentsController: bảo đảm owner chỉ đến từ guard và query được chuyển tới use case.
// | STT | Test case      | Mục đích                                | Các bước làm                              | Kết quả mong đợi                         |
// |-----|----------------|-----------------------------------------|-------------------------------------------|------------------------------------------|
// | 1   | Query hợp lệ  | Ủy quyền liệt kê theo workspace hiện tại| Gọi list với workspace và DTO             | Trả page và chuyển đúng arguments        |

import type { ListUserDocumentsService } from '@/modules/document-template-library/application/services/user-documents/list-user-documents/list-user-documents.service';
import { ListUserDocumentsController } from '@/modules/document-template-library/presentation/controllers/user-documents/list-user-documents/list-user-documents.controller';
import { ListUserDocumentsQueryDto } from '@/modules/document-template-library/presentation/dto/list-user-documents-query/list-user-documents-query.dto';

describe('ListUserDocumentsController', () => {
    let target: ListUserDocumentsController;
    let mockListUserDocuments: jest.Mocked<
        Pick<ListUserDocumentsService, 'execute'>
    >;

    beforeEach(() => {
        mockListUserDocuments = { execute: jest.fn() };
        target = new ListUserDocumentsController(
            mockListUserDocuments as unknown as ListUserDocumentsService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận client không tự truyền workspace và controller dùng owner đã xác thực.
    it('should list the requested page for the current workspace', async () => {
        // Bước 1 - Arrange: DTO query hợp lệ và service trả page đã phân trang.
        const query = Object.assign(new ListUserDocumentsQueryDto(), {
            page: 2,
            limit: 5,
            search: 'Báo cáo',
        });
        const expected = {
            items: [],
            total: 7,
            page: 2,
            limit: 5,
            totalPages: 2,
        };
        mockListUserDocuments.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi GET /user-documents như sau khi guard hoàn tất.
        const result = await target.list('workspace-1', query);

        // Bước 3 - Assert: trả page và chỉ dùng workspace ID do guard cấp.
        expect(result).toEqual(expected);
        expect(mockListUserDocuments.execute.mock.calls).toEqual([
            ['workspace-1', query],
        ]);
    });
});
