// Nhóm unit test cho GetUserDocumentEditorFileService: xác thực token editor và cấp đúng revision DOCX của tài liệu READY.
// | STT | Test case                | Mục đích                                      | Các bước làm                                                | Kết quả mong đợi                                    |
// |-----|--------------------------|-----------------------------------------------|-------------------------------------------------------------|-----------------------------------------------------|
// | 1   | Token và revision hợp lệ | Cấp file hiện hành cho editor                 | Reader trả READY; token khớp document/revision; gọi execute | Trả đúng output file reference                      |
// | 2   | Không tìm thấy           | Từ chối ID không tồn tại                      | Reader trả null; gọi execute                                | Ném not-found                                       |
// | 3   | Thiếu output file        | Không cấp file cho record chưa sẵn sàng       | Reader trả READY nhưng outputFile=null                      | Ném UserDocumentNotReadyError                       |
// | 4   | Token sai                | Chặn truy cập trước khi cấp file              | Docs service từ chối token                                  | Lỗi xác thực được truyền lên                        |
// | 5   | Reader lỗi               | Không xác thực token nếu chưa đọc được record | Reader reject; gọi execute                                  | Lỗi reader được truyền lên, docs service không chạy |

import { createHash } from 'node:crypto';
import type { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import type { UserDocumentReaderContract } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { UserDocumentRecord } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/user-document-management/application/errors/user-document-not-ready.error';
import { GetUserDocumentEditorFileService } from '@/modules/user-document-management/application/services/user-documents/get-user-document-editor-file/get-user-document-editor-file.service';

const currentFile: StoredFileReference = {
    provider: 'local',
    storageNamespace: 'user-documents',
    objectKey: 'documents/document-1.docx',
    originalFilename: 'Báo cáo tháng.docx',
    mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: '512',
    sha256: 'file-checksum',
};

const readyDocument: UserDocumentRecord = {
    id: 'document-1',
    title: 'Báo cáo tháng',
    status: 'ready',
    failureCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    downloadUrl: '/api/user-documents/document-1/download',
    outputFile: currentFile,
    sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 3 },
};

describe('GetUserDocumentEditorFileService', () => {
    let target: GetUserDocumentEditorFileService;
    let mockDocumentReader: jest.Mocked<
        Pick<UserDocumentReaderContract, 'findUserDocumentById'>
    >;
    let mockOnlyOfficeDocs: jest.Mocked<
        Pick<OnlyOfficeDocsService, 'verifyDocumentFileToken'>
    >;

    beforeEach(() => {
        mockDocumentReader = { findUserDocumentById: jest.fn() };
        mockOnlyOfficeDocs = { verifyDocumentFileToken: jest.fn() };
        target = new GetUserDocumentEditorFileService(
            mockDocumentReader,
            mockOnlyOfficeDocs as unknown as OnlyOfficeDocsService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1: token được ràng buộc với id và object revision, response chỉ cấp file riêng hiện hành.
    it('should verify the current revision and return its DOCX file reference', async () => {
        // Bước 1 - Arrange: reader trả bản sao READY; hash dùng cùng định dạng với editor config.
        const expectedKey = createHash('sha256')
            .update(
                `${readyDocument.id}:${currentFile.storageNamespace}:${currentFile.objectKey}`,
            )
            .digest('hex');
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        mockOnlyOfficeDocs.verifyDocumentFileToken.mockResolvedValue(undefined);

        // Bước 2 - Act: ONLYOFFICE yêu cầu file với signed query token.
        const result = await target.execute('document-1', 'signed-file-token');

        // Bước 3 - Assert: token được xác minh đúng revision và tên file giữ đuôi DOCX.
        expect(result).toEqual({
            file: currentFile,
            filename: 'Báo cáo tháng.docx',
        });
        expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual([
            ['document-1'],
        ]);
        expect(mockOnlyOfficeDocs.verifyDocumentFileToken.mock.calls).toEqual([
            ['signed-file-token', 'document-1', expectedKey],
        ]);
    });

    // Test 2: id không tồn tại không được đưa tới bộ xác thực token.
    it('should throw not found when the user document does not exist', async () => {
        // Bước 1 - Arrange: reader không tìm thấy bản ghi.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: trả lỗi 404 và không xác minh token cho tài nguyên vắng mặt.
        await expect(
            target.execute('missing-document', 'signed-file-token'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockOnlyOfficeDocs.verifyDocumentFileToken.mock.calls).toEqual(
            [],
        );
    });

    // Test 3: trạng thái provisioning/failed không cho server đọc file chưa sẵn sàng.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state',
        async (status) => {
            // Bước 1 - Arrange: tài liệu chưa READY và chưa có output file.
            mockDocumentReader.findUserDocumentById.mockResolvedValue({
                ...readyDocument,
                status,
                outputFile: null,
            });

            // Bước 2 - Act và Bước 3 - Assert: chặn trước khi kiểm tra token hoặc mở storage.
            await expect(
                target.execute('document-1', 'signed-file-token'),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
            expect(
                mockOnlyOfficeDocs.verifyDocumentFileToken.mock.calls,
            ).toEqual([]);
        },
    );

    // Test 4: READY thiếu output file vẫn fail closed trước khi xác thực token.
    it('should reject a ready document without an output file', async () => {
        // Bước 1 - Arrange: mô phỏng persistence trả về record vi phạm invariant.
        mockDocumentReader.findUserDocumentById.mockResolvedValue({
            ...readyDocument,
            outputFile: null,
        });

        // Bước 2 - Act và Bước 3 - Assert: báo conflict và không cấp file reference rỗng.
        await expect(
            target.execute('document-1', 'signed-file-token'),
        ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
        expect(mockOnlyOfficeDocs.verifyDocumentFileToken.mock.calls).toEqual(
            [],
        );
    });

    // Test 5: JWT/revision không hợp lệ được chuyển nguyên vẹn để HTTP boundary trả 401.
    it('should propagate token verification failures', async () => {
        // Bước 1 - Arrange: reader hợp lệ nhưng service xác thực từ chối token.
        const failure = new Error('invalid signed token');
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        mockOnlyOfficeDocs.verifyDocumentFileToken.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: không che lỗi bảo mật và không trả file cho caller.
        await expect(
            target.execute('document-1', 'tampered-token'),
        ).rejects.toBe(failure);
        expect(
            mockOnlyOfficeDocs.verifyDocumentFileToken,
        ).toHaveBeenCalledTimes(1);
    });

    // Test 6: reader failure phải dừng trước khi tin token hay cấp reference.
    it('should propagate reader failures without verifying the token', async () => {
        // Bước 1 - Arrange: adapter đọc metadata gặp lỗi.
        const failure = new Error('reader unavailable');
        mockDocumentReader.findUserDocumentById.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ nguyên lỗi persistence và không gọi verifier.
        await expect(
            target.execute('document-1', 'signed-file-token'),
        ).rejects.toBe(failure);
        expect(mockOnlyOfficeDocs.verifyDocumentFileToken.mock.calls).toEqual(
            [],
        );
    });
});
