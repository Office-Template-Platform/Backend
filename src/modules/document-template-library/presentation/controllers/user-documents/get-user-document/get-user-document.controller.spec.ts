// Nhóm unit test cho GetUserDocumentController: xác nhận document ID được ủy quyền đọc metadata.
// | STT | Test case        | Mục đích                              | Các bước làm                          | Kết quả mong đợi                   |
// |-----|------------------|---------------------------------------|---------------------------------------|------------------------------------|
// | 1   | Tài liệu tồn tại | Trả summary của document được yêu cầu | Gọi get với UUID; service trả summary | Trả đúng summary và chuyển đúng ID |

import type { UserDocumentSummary } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { GetUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/get-user-document/get-user-document.service';
import { GetUserDocumentController } from '@/modules/document-template-library/presentation/controllers/user-documents/get-user-document/get-user-document.controller';

describe('GetUserDocumentController', () => {
    let target: GetUserDocumentController;
    let mockGetUserDocument: jest.Mocked<
        Pick<GetUserDocumentService, 'execute'>
    >;

    beforeEach(() => {
        mockGetUserDocument = { execute: jest.fn() };
        target = new GetUserDocumentController(
            mockGetUserDocument as unknown as GetUserDocumentService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận metadata public được trả về mà không lộ output file reference.
    it('should return the summary for the requested user document', async () => {
        // Bước 1 - Arrange: use case trả summary đã loại bỏ storage reference.
        const expected: UserDocumentSummary = {
            id: 'document-1',
            title: 'My Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        };
        mockGetUserDocument.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi endpoint GET /user-documents/:documentId.
        const result = await target.detail('document-1', 'workspace-1');

        // Bước 3 - Assert: trả summary nguyên vẹn và truy vấn đúng UUID.
        expect(result).toEqual(expected);
        expect(mockGetUserDocument.execute.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
    });
});
