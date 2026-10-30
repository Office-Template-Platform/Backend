// Nhóm unit test cho DeleteUserDocumentService: kiểm tra xóa theo workspace và cleanup file sau commit.
// | STT | Test case             | Mục đích                                  | Các bước làm                                      | Kết quả mong đợi                              |
// |-----|-----------------------|-------------------------------------------|---------------------------------------------------|-----------------------------------------------|
// | 1   | Tài liệu có file      | Xóa mềm rồi dọn output object             | Writer trả file cleanup; gọi execute              | Storage nhận đúng file, service hoàn tất       |
// | 2   | Không thuộc workspace | Không tiết lộ tài liệu của owner khác      | Writer trả null; gọi execute                     | Ném UserDocumentNotFoundError, không dọn file  |
// | 3   | File còn được dùng    | Không xóa object đang được tài liệu khác dùng | Writer trả fileToCleanup null; gọi execute     | Storage không được gọi                         |
// | 4   | Cleanup lỗi           | Không báo thất bại sau khi DB đã commit    | Storage reject; gọi execute                      | Service vẫn hoàn tất                            |

import { Logger } from '@nestjs/common';
import type { DocumentFileStorageContract } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type { UserDocumentDeleterContract } from '@/modules/document-template-library/application/contracts/user-document-deleter.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { DeleteUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/delete-user-document/delete-user-document.service';

describe('DeleteUserDocumentService', () => {
    let target: DeleteUserDocumentService;
    let mockDocumentDeleter: jest.Mocked<
        Pick<UserDocumentDeleterContract, 'deleteForWorkspace'>
    >;
    let mockFileStorage: jest.Mocked<
        Pick<DocumentFileStorageContract, 'removeUserDocument'>
    >;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        mockDocumentDeleter = { deleteForWorkspace: jest.fn() };
        mockFileStorage = { removeUserDocument: jest.fn() };
        target = new DeleteUserDocumentService(
            mockDocumentDeleter,
            mockFileStorage,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Test 1 xác nhận writer kiểm tra owner trước và storage chỉ dọn file sau khi writer trả kết quả commit.
    it('should delete the owned document and remove its unshared output file', async () => {
        // Bước 1 - Arrange: transaction đã xóa mềm và xác nhận file không còn tài liệu hoạt động tham chiếu.
        const fileToCleanup = {
            provider: 'local' as const,
            storageNamespace: 'user-documents',
            objectKey: 'documents/resume.docx',
            originalFilename: 'Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'content-hash',
        };
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue({
            fileToCleanup,
        });
        mockFileStorage.removeUserDocument.mockResolvedValue(undefined);

        // Bước 2 - Act: xóa tài liệu trong workspace lấy từ cookie đã xác thực.
        await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: writer nhận đúng scope, sau đó storage nhận đúng reference nội bộ.
        expect(mockDocumentDeleter.deleteForWorkspace.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [fileToCleanup],
        ]);
    });

    // Test 2 giữ cùng lỗi 404 cho ID vắng mặt, đã xóa hoặc thuộc workspace khác.
    it('should return not found and skip storage when the document is outside the workspace', async () => {
        // Bước 1 - Arrange: writer không tìm thấy document trong workspace yêu cầu.
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: use case từ chối và không truy cập file storage.
        await expect(
            target.execute('document-1', 'workspace-2'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockFileStorage.removeUserDocument).not.toHaveBeenCalled();
    });

    // Test 3 bảo vệ object nếu repository phát hiện một document đang hoạt động vẫn dùng chung reference.
    it('should preserve an output file that is still referenced by another active document', async () => {
        // Bước 1 - Arrange: bản ghi đã xóa nhưng storage object còn được owner khác sử dụng.
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue({
            fileToCleanup: null,
        });

        // Bước 2 - Act: hoàn tất xóa mềm theo kết quả transaction.
        await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: không gọi storage khi không có reference cleanup an toàn.
        expect(mockFileStorage.removeUserDocument).not.toHaveBeenCalled();
    });

    // Test 4 giữ kết quả 204 thành công khi DB đã xóa nhưng filesystem cleanup gặp lỗi tạm thời.
    it('should keep deletion successful when post-commit file cleanup fails', async () => {
        // Bước 1 - Arrange: transaction đã commit; storage báo lỗi khi xóa object vật lý.
        mockDocumentDeleter.deleteForWorkspace.mockResolvedValue({
            fileToCleanup: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/resume.docx',
                originalFilename: 'Resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'content-hash',
            },
        });
        mockFileStorage.removeUserDocument.mockRejectedValue(
            new Error('filesystem unavailable'),
        );

        // Bước 2 - Act và Bước 3 - Assert: API không trả lỗi để client không retry một xóa đã commit.
        await expect(
            target.execute('document-1', 'workspace-1'),
        ).resolves.toBeUndefined();
        expect(mockFileStorage.removeUserDocument).toHaveBeenCalledTimes(1);
    });
});
