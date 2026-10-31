// Nhóm unit test cho DeleteUserDocumentController: kiểm tra route truyền đúng document và workspace tới use case.
// | STT | Test case           | Mục đích                              | Các bước làm                                | Kết quả mong đợi                         |
// |-----|---------------------|---------------------------------------|---------------------------------------------|------------------------------------------|
// | 1   | Xóa thành công      | Ủy quyền xóa tài liệu đúng owner      | Gọi remove với UUID và workspace hợp lệ     | Use case nhận đúng hai định danh         |
// | 2   | Service từ chối     | Giữ nguyên lỗi 404 ở HTTP boundary    | Service reject UserDocumentNotFoundError   | Controller truyền lỗi lên                |

import type { DeleteUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/delete-user-document/delete-user-document.service';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { DeleteUserDocumentController } from '@/modules/user-document-management/presentation/controllers/delete-user-document/delete-user-document.controller';

describe('DeleteUserDocumentController', () => {
    let target: DeleteUserDocumentController;
    let mockDeleteUserDocument: jest.Mocked<
        Pick<DeleteUserDocumentService, 'execute'>
    >;

    beforeEach(() => {
        mockDeleteUserDocument = { execute: jest.fn() };
        target = new DeleteUserDocumentController(
            mockDeleteUserDocument as unknown as DeleteUserDocumentService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận controller chỉ chuyển định danh đã qua pipe/decorator sang use case.
    it('should delegate deletion with the validated document and workspace IDs', async () => {
        // Bước 1 - Arrange: service hoàn tất thao tác xóa không cần response body.
        mockDeleteUserDocument.execute.mockResolvedValue(undefined);

        // Bước 2 - Act: gọi handler tương ứng DELETE /user-documents/:documentId.
        await target.remove('document-1', 'workspace-1');

        // Bước 3 - Assert: không tự chọn owner từ request body và giữ response rỗng cho HTTP 204.
        expect(mockDeleteUserDocument.execute.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
    });

    // Test 2 bảo đảm lỗi service không bị nuốt hoặc đổi thành response thành công.
    it('should propagate not-found errors from the deletion use case', async () => {
        // Bước 1 - Arrange: service không thấy tài liệu thuộc workspace hiện tại.
        const failure = new UserDocumentNotFoundError();
        mockDeleteUserDocument.execute.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: controller giữ nguyên lỗi HTTP 404.
        await expect(target.remove('document-1', 'workspace-2')).rejects.toBe(
            failure,
        );
    });
});
