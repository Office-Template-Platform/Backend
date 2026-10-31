// Nhóm unit test cho RestoreUserDocumentController: kiểm tra ID và workspace từ request boundary được chuyển đúng.
// | STT | Test case       | Mục đích                                  | Các bước làm                              | Kết quả mong đợi                  |
// |-----|-----------------|-------------------------------------------|-------------------------------------------|-----------------------------------|
// | 1   | Restore hợp lệ  | Gọi use case theo owner từ guard          | Gọi restore với documentId/workspaceId    | Hoàn tất và không tạo response body |
// | 2   | Use case lỗi    | Giữ lỗi 404 từ trạng thái/owner không hợp lệ | Service reject; gọi restore             | Lỗi được truyền lên                |

import type { RestoreUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/restore-user-document/restore-user-document.service';
import { RestoreUserDocumentController } from '@/modules/user-document-management/presentation/controllers/restore-user-document/restore-user-document.controller';

describe('RestoreUserDocumentController', () => {
    let target: RestoreUserDocumentController;
    let mockRestoreUserDocument: jest.Mocked<
        Pick<RestoreUserDocumentService, 'execute'>
    >;

    beforeEach(() => {
        mockRestoreUserDocument = { execute: jest.fn() };
        target = new RestoreUserDocumentController(
            mockRestoreUserDocument as unknown as RestoreUserDocumentService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận controller chuyển đúng document ID và workspace đã được guard xác thực.
    it('should delegate restoration to the service with the guarded workspace', async () => {
        // Bước 1 - Arrange: service hoàn tất khôi phục thành công.
        mockRestoreUserDocument.execute.mockResolvedValue(undefined);

        // Bước 2 - Act: gọi PATCH /user-documents/:documentId/restore.
        await target.restore('document-1', 'workspace-1');

        // Bước 3 - Assert: controller chuyển đúng hai tham số và không tự đổi kết quả.
        expect(mockRestoreUserDocument.execute.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
    });

    // Test 2 xác nhận controller để exception filter chuẩn hóa lỗi từ application service.
    it('should propagate service failures', async () => {
        // Bước 1 - Arrange: use case báo tài liệu không tồn tại trong thùng rác owner hiện tại.
        const failure = new Error('document not found');
        mockRestoreUserDocument.execute.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ lỗi gốc cho exception filter.
        await expect(target.restore('document-1', 'workspace-1')).rejects.toBe(
            failure,
        );
    });
});
