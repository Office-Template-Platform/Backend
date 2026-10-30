// Nhóm unit test cho ListUserDocumentsService: kiểm tra cách ly theo workspace, projection an toàn và metadata phân trang.
// | STT | Test case       | Mục đích                                 | Các bước làm                               | Kết quả mong đợi                         |
// |-----|-----------------|------------------------------------------|--------------------------------------------|------------------------------------------|
// | 1   | Có tài liệu     | Trả summary workspace hiện tại           | Reader trả records; gọi execute            | Item đúng và totalPages được tính        |
// | 2   | Workspace rỗng  | Trả trạng thái rỗng ổn định               | Reader trả items rỗng, total 0             | totalPages bằng 0                        |
// | 3   | Reader lỗi      | Không che sự cố persistence               | Reader reject; gọi execute                 | Lỗi gốc được truyền lên                 |

import type { UserDocumentReaderContract } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { ListUserDocumentsService } from '@/modules/document-template-library/application/services/user-documents/list-user-documents/list-user-documents.service';

describe('ListUserDocumentsService', () => {
    let target: ListUserDocumentsService;
    let mockDocumentReader: jest.Mocked<
        Pick<UserDocumentReaderContract, 'listUserDocumentsByWorkspace'>
    >;

    beforeEach(() => {
        mockDocumentReader = { listUserDocumentsByWorkspace: jest.fn() };
        target = new ListUserDocumentsService(mockDocumentReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận owner và query pagination đi nguyên vẹn tới reader, output không lộ storage reference.
    it('should return a paged public summary for the requested workspace', async () => {
        // Bước 1 - Arrange: reader trả một record có file reference nội bộ.
        const record: UserDocumentRecord = {
            id: 'document-1',
            title: 'Báo cáo tháng',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'private/document-1.docx',
                originalFilename: 'Báo cáo tháng.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'private-hash',
            },
            sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 2 },
        };
        const query = { page: 2, limit: 10, search: 'báo cáo' };
        mockDocumentReader.listUserDocumentsByWorkspace.mockResolvedValue({
            items: [record],
            total: 11,
        });

        // Bước 2 - Act: liệt kê trong workspace đã được guard xác thực.
        const result = await target.execute('workspace-1', query);

        // Bước 3 - Assert: trang được tính đúng và file key không rò rỉ trong response.
        expect(result).toEqual({
            items: [
                {
                    id: 'document-1',
                    title: 'Báo cáo tháng',
                    status: 'ready',
                    failureCode: null,
                    createdAt: '2026-10-01T00:00:00.000Z',
                    updatedAt: '2026-10-03T00:00:00.000Z',
                    downloadUrl: '/api/user-documents/document-1/download',
                    sourceTemplate: {
                        id: 'template-1',
                        name: 'Báo cáo',
                        version: 2,
                    },
                },
            ],
            total: 11,
            page: 2,
            limit: 10,
            totalPages: 2,
        });
        expect(JSON.stringify(result)).not.toContain('private/document-1.docx');
        expect(
            mockDocumentReader.listUserDocumentsByWorkspace.mock.calls,
        ).toEqual([['workspace-1', query]]);
    });

    // Test 2 biểu diễn đúng danh sách trống khi workspace chưa tạo tài liệu nào.
    it('should return zero pages for an empty workspace', async () => {
        // Bước 1 - Arrange: reader trả về tập rỗng và tổng bằng không.
        mockDocumentReader.listUserDocumentsByWorkspace.mockResolvedValue({
            items: [],
            total: 0,
        });

        // Bước 2 - Act: yêu cầu trang mặc định của workspace.
        const result = await target.execute('workspace-1', {
            page: 1,
            limit: 12,
        });

        // Bước 3 - Assert: UI nhận mảng rỗng và metadata nhất quán.
        expect(result).toEqual({
            items: [],
            total: 0,
            page: 1,
            limit: 12,
            totalPages: 0,
        });
    });

    // Test 3 giữ lỗi adapter nguyên dạng để lỗi database không bị báo thành thư viện rỗng.
    it('should propagate reader failures without changing the error', async () => {
        // Bước 1 - Arrange: reader reject do database không sẵn sàng.
        const failure = new Error('database unavailable');
        mockDocumentReader.listUserDocumentsByWorkspace.mockRejectedValue(
            failure,
        );

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc được truyền nguyên vẹn lên HTTP boundary.
        await expect(
            target.execute('workspace-1', { page: 1, limit: 12 }),
        ).rejects.toBe(failure);
    });
});
