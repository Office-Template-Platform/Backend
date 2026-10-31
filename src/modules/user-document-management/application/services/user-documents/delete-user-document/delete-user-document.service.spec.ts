// Nhóm unit test cho DeleteUserDocumentService: kiểm tra xóa mềm theo workspace và không gọi storage.
// | STT | Test case             | Mục đích                                  | Các bước làm                         | Kết quả mong đợi                                      |
// |-----|-----------------------|-------------------------------------------|--------------------------------------|-------------------------------------------------------|
// | 1   | Tài liệu thuộc owner  | Ủy quyền xóa mềm                          | Deleter trả true; gọi execute        | Hoàn tất, chỉ repository được gọi                     |
// | 2   | Không thuộc owner     | Không lộ tài liệu workspace khác          | Deleter trả false; gọi execute       | Ném UserDocumentNotFoundError                         |
// | 3   | Repository lỗi        | Không che sự cố transaction               | Deleter reject; gọi execute           | Truyền nguyên lỗi lên caller                          |

import type { UserDocumentDeleterContract } from '@/modules/user-document-management/application/contracts/user-document-deleter.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { DeleteUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/delete-user-document/delete-user-document.service';

describe('DeleteUserDocumentService', () => {
    let target: DeleteUserDocumentService;
    let mockDocumentDeleter: jest.Mocked<
        Pick<UserDocumentDeleterContract, 'deleteForWorkspace'>
    >;

    beforeEach(() => {
        mockDocumentDeleter = { deleteForWorkspace: jest.fn() };
        target = new DeleteUserDocumentService(mockDocumentDeleter);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 đảm bảo use case chỉ yêu cầu repository đánh dấu deleted_at, không nhận dependency xóa file.
    it('should soft-delete the owned document without calling file storage', async () => {
        // Bước 1 - Arrange: repository xác nhận document thuộc workspace và đã được xóa mềm.
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue(true);

        // Bước 2 - Act: xóa tài liệu bằng workspace do guard cung cấp.
        await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: scope được truyền nguyên vẹn và use case hoàn tất không chạy cleanup file.
        expect(mockDocumentDeleter.deleteForWorkspace.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
    });

    // Test 2 dùng chung 404 cho ID không tồn tại, đã xóa hoặc thuộc workspace khác.
    it('should throw not found when the document is outside the current workspace', async () => {
        // Bước 1 - Arrange: repository không tìm thấy document trong workspace yêu cầu.
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue(false);

        // Bước 2 - Act và Bước 3 - Assert: service không tiết lộ trạng thái sở hữu.
        await expect(
            target.execute('document-1', 'workspace-2'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockDocumentDeleter.deleteForWorkspace).toHaveBeenCalledTimes(1);
    });

    // Test 3 giữ nguyên lỗi persistence để HTTP boundary không biến sự cố database thành kết quả thành công.
    it('should propagate repository failures without changing the error', async () => {
        // Bước 1 - Arrange: transaction báo lỗi ngoài dự kiến.
        const failure = new Error('database unavailable');
        mockDocumentDeleter.deleteForWorkspace.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc được truyền nguyên dạng.
        await expect(target.execute('document-1', 'workspace-1')).rejects.toBe(
            failure,
        );
    });
});
