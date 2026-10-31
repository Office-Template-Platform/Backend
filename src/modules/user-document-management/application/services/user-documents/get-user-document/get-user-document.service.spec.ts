// Nhóm unit test cho GetUserDocumentService: xác nhận metadata public không để lộ storage reference và xử lý lỗi reader.
// | STT | Test case        | Mục đích                            | Các bước làm                             | Kết quả mong đợi                             |
// |-----|------------------|-------------------------------------|------------------------------------------|----------------------------------------------|
// | 1   | Tài liệu tồn tại | Trả summary công khai an toàn       | Reader trả record có output; gọi execute | Summary không chứa outputFile hoặc objectKey |
// | 2   | Không tìm thấy   | Báo document ID không tồn tại       | Reader trả null; gọi execute             | Ném UserDocumentNotFoundError                |
// | 3   | Reader gặp lỗi   | Không đổi lỗi persistence thành 404 | Reader reject; gọi execute               | Lỗi gốc được truyền lên                      |

import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
} from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { GetUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/get-user-document/get-user-document.service';

describe('GetUserDocumentService', () => {
    let target: GetUserDocumentService;
    let mockDocumentReader: jest.Mocked<
        Pick<UserDocumentReaderContract, 'findUserDocumentByIdForWorkspace'>
    >;

    beforeEach(() => {
        mockDocumentReader = { findUserDocumentByIdForWorkspace: jest.fn() };
        target = new GetUserDocumentService(mockDocumentReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận metadata được giữ nguyên còn file reference nội bộ bị loại khỏi response.
    it('should return a public summary without output file metadata', async () => {
        // Bước 1 - Arrange: reader trả record READY có storage key nội bộ.
        const record: UserDocumentRecord = {
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'private/secret.docx',
                originalFilename: 'My resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'secret-hash',
            },
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 2 },
        };
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
            record,
        );

        // Bước 2 - Act: yêu cầu metadata theo document id.
        const result = await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: summary chính xác và không lộ objectKey hay outputFile.
        expect(result).toEqual({
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 2 },
        });
        expect(result).not.toHaveProperty('outputFile');
        expect(JSON.stringify(result)).not.toContain('private/secret.docx');
        expect(
            mockDocumentReader.findUserDocumentByIdForWorkspace.mock.calls,
        ).toEqual([['document-1', 'workspace-1']]);
    });

    // Test 2 bảo đảm id không tồn tại thành lỗi 404 thay vì trả null.
    it('should throw a not-found error when the document does not exist', async () => {
        // Bước 1 - Arrange: reader trả null cho UUID hợp lệ nhưng không có bản ghi.
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
            null,
        );

        // Bước 2 - Act và Bước 3 - Assert: use case ném lỗi not-found cụ thể.
        await expect(
            target.execute('missing-id', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
    });

    // Test 3 giữ lỗi database nguyên trạng để không nhầm với tài liệu vắng mặt.
    it('should propagate reader failures without changing the error', async () => {
        // Bước 1 - Arrange: adapter reject do sự cố persistence.
        const failure = new Error('database unavailable');
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockRejectedValue(
            failure,
        );

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc không bị ánh xạ thành 404.
        await expect(target.execute('document-1', 'workspace-1')).rejects.toBe(
            failure,
        );
    });
});
