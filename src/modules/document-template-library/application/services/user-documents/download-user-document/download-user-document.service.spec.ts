// Nhóm unit test cho DownloadUserDocumentService: kiểm tra filename, not-found và READY guard.
// | STT | Test case          | Mục đích                           | Các bước làm                         | Kết quả mong đợi                         |
// |-----|--------------------|------------------------------------|--------------------------------------|------------------------------------------|
// | 1   | Tài liệu READY     | Cấp file và tên tải xuống          | Reader trả ready có file; execute    | Trả reference và tên .docx chính xác     |
// | 2   | Không tồn tại      | Báo tài liệu không tồn tại         | Reader trả null; execute             | Ném UserDocumentNotFoundError            |
// | 3   | Đang tạo/thất bại  | Chặn file chưa sẵn sàng            | Reader trả trạng thái khác ready     | Ném UserDocumentNotReadyError            |
// | 4   | READY thiếu file   | Bảo vệ invariant trước khi stream   | Reader trả ready nhưng output null   | Ném UserDocumentNotReadyError            |
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { DownloadUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/download-user-document/download-user-document.service';

describe('DownloadUserDocumentService', () => {
    let target: DownloadUserDocumentService;
    let mockDocumentReader: jest.Mocked<UserDocumentReaderContract>;

    beforeEach(() => {
        mockDocumentReader = { findUserDocumentById: jest.fn() };
        target = new DownloadUserDocumentService(mockDocumentReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận chỉ metadata file hiện hành được cấp cho controller tải xuống.
    it('should return the current file and a DOCX filename for a ready document', async () => {
        // Bước 1 - Arrange: chuẩn bị tài liệu READY có output file riêng.
        const file = {
            provider: 'local' as const,
            storageNamespace: 'user-documents',
            objectKey: 'documents/document-1.docx',
            originalFilename: 'My resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'hash',
        };
        const record: UserDocumentRecord = {
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: file,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        };
        mockDocumentReader.findUserDocumentById.mockResolvedValue(record);

        // Bước 2 - Act: lấy file reference theo document id.
        const result = await target.execute('document-1');

        // Bước 3 - Assert: file hiện tại và tên đuôi DOCX được trả chính xác.
        expect(result).toEqual({ file, filename: 'My resume.docx' });
        expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual([
            ['document-1'],
        ]);
    });

    // Test 2 phân biệt UUID sai dữ liệu với file đang chờ xử lý.
    it('should throw a not-found error when the document does not exist', async () => {
        // Bước 1 - Arrange: reader trả null vì không có bản ghi.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: trả đúng lỗi 404 application.
        await expect(target.execute('missing-id')).rejects.toBeInstanceOf(
            UserDocumentNotFoundError,
        );
    });

    // Test 3 chặn các trạng thái provisioning/failed để client không tải file dở dang.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state',
        async (status) => {
            // Bước 1 - Arrange: bản ghi tồn tại nhưng chưa ở trạng thái READY.
            mockDocumentReader.findUserDocumentById.mockResolvedValue({
                id: 'document-1',
                title: 'My resume',
                status,
                failureCode: status === 'failed' ? 'COPY_FAILED' : null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                downloadUrl: null,
                outputFile: null,
                sourceTemplate: {
                    id: 'template-1',
                    name: 'Resume',
                    version: 1,
                },
            });

            // Bước 2 - Act và Bước 3 - Assert: trả HTTP 409 để client thử lại khi phù hợp.
            await expect(target.execute('document-1')).rejects.toBeInstanceOf(
                UserDocumentNotReadyError,
            );
        },
    );

    // Test 4 bảo vệ invariant ngay cả khi persistence trả READY nhưng thiếu quan hệ file.
    it('should reject a ready document that has no output file reference', async () => {
        // Bước 1 - Arrange: tạo trạng thái không hợp lệ để xác nhận service fail closed.
        mockDocumentReader.findUserDocumentById.mockResolvedValue({
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: null,
            outputFile: null,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        });

        // Bước 2 - Act và Bước 3 - Assert: không cho controller mở stream rỗng.
        await expect(target.execute('document-1')).rejects.toBeInstanceOf(
            UserDocumentNotReadyError,
        );
    });
});
