// Nhóm unit test cho ListUserDocumentsController: bảo đảm danh sách thường và thùng rác dùng owner từ guard.
// | STT | Test case          | Mục đích                                  | Các bước làm                                | Kết quả mong đợi                   |
// |-----|--------------------|-------------------------------------------|---------------------------------------------|------------------------------------|
// | 1   | Danh sách thường   | Ủy quyền liệt kê workspace hiện tại       | Gọi list với workspace và DTO                | Trả page và đúng arguments          |
// | 2   | Thùng rác          | Ủy quyền liệt kê tài liệu đã xóa           | Gọi listTrash với workspace và DTO           | Gọi executeDeleted đúng arguments   |

import type { ListUserDocumentsService } from '@/modules/user-document-management/application/services/user-documents/list-user-documents/list-user-documents.service';
import { ListUserDocumentsController } from '@/modules/user-document-management/presentation/controllers/list-user-documents/list-user-documents.controller';
import { ListUserDocumentsQueryDto } from '@/modules/user-document-management/presentation/dto/list-user-documents-query/list-user-documents-query.dto';

describe('ListUserDocumentsController', () => {
    let target: ListUserDocumentsController;
    let mockListUserDocuments: jest.Mocked<
        Pick<ListUserDocumentsService, 'execute' | 'executeDeleted'>
    >;

    beforeEach(() => {
        mockListUserDocuments = {
            execute: jest.fn(),
            executeDeleted: jest.fn(),
        };
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

    // Test 2 xác nhận endpoint thùng rác không nhận workspace từ query hoặc body của client.
    it('should list trash items for the workspace resolved by the guard', async () => {
        // Bước 1 - Arrange: query phân trang và response thùng rác do service chuẩn bị.
        const query = Object.assign(new ListUserDocumentsQueryDto(), {
            page: 1,
            limit: 12,
            search: 'Báo cáo',
        });
        const expected = {
            items: [],
            total: 0,
            page: 1,
            limit: 12,
            totalPages: 0,
        };
        mockListUserDocuments.executeDeleted.mockResolvedValue(expected);

        // Bước 2 - Act: gọi route GET /user-documents/trash/items sau khi guard resolve owner.
        const result = await target.listTrash('workspace-1', query);

        // Bước 3 - Assert: controller trả response và chuyển đúng workspace cùng query.
        expect(result).toEqual(expected);
        expect(mockListUserDocuments.executeDeleted.mock.calls).toEqual([
            ['workspace-1', query],
        ]);
    });
});
