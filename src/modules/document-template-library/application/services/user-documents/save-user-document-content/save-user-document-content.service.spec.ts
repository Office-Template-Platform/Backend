// Nhóm unit test cho SaveUserDocumentContentService: kiểm tra trạng thái, chuẩn hóa tên file và cleanup transaction.
// | STT | Test case                | Mục đích                             | Các bước làm                                  | Kết quả mong đợi                             |
// |-----|--------------------------|--------------------------------------|-----------------------------------------------|----------------------------------------------|
// | 1   | READY và replace tốt     | Lưu file mới, xóa file cũ            | Reader ready; storage save; writer replace   | Trả summary, UUID key, tên basename           |
// | 2   | Không tồn tại            | Không ghi file                       | Reader null; gọi execute                     | Ném not found, không gọi storage              |
// | 3   | Chưa READY               | Chặn trước I/O                       | Reader provisioning/failed                   | Ném conflict, không gọi storage               |
// | 4   | READY thiếu output       | Bảo vệ invariant                     | Reader ready nhưng output null               | Ném conflict, không gọi storage               |
// | 5   | Save file lỗi            | Không đổi lỗi storage                | Storage reject trước transaction             | Writer không được gọi                         |
// | 6   | Replace lỗi              | Dọn file mới                         | File mới được ghi; writer reject             | Xóa file mới và giữ lỗi transaction           |
// | 7   | Xóa file cũ lỗi          | Giữ bản mới đã commit                | Replace thành công; cleanup cũ reject         | Trả summary thành công                         |
// | 8   | Xóa file mới cũng lỗi    | Không che lỗi replace                | Writer reject; cleanup mới reject             | Reject đúng lỗi replace ban đầu               |
import { Logger } from '@nestjs/common';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import type {
    UserDocumentWriterContract,
    ReplacedUserDocumentFile,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { SaveUserDocumentContentService } from '@/modules/document-template-library/application/services/user-documents/save-user-document-content/save-user-document-content.service';

describe('SaveUserDocumentContentService', () => {
    let target: SaveUserDocumentContentService;
    let mockDocumentReader: jest.Mocked<UserDocumentReaderContract>;
    let mockDocumentWriter: jest.Mocked<UserDocumentWriterContract>;
    let mockFileStorage: jest.Mocked<DocumentFileStorageContract>;
    let currentDocument: UserDocumentRecord;
    let newFile: StoredFileReference;
    let previousFile: StoredFileReference;
    let replaced: ReplacedUserDocumentFile;
    const content = Buffer.from('edited docx bytes');

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        mockDocumentReader = { findUserDocumentById: jest.fn() };
        mockDocumentWriter = {
            createProvisioningDocument: jest.fn(),
            completeDocument: jest.fn(),
            replaceDocumentFile: jest.fn(),
            markDocumentFailed: jest.fn(),
        };
        mockFileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        previousFile = {
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/old.docx',
            originalFilename: 'old.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '100',
            sha256: 'old-hash',
        };
        newFile = {
            ...previousFile,
            objectKey: 'documents/new.docx',
            originalFilename: 'Resume.docx',
            sizeBytes: String(content.byteLength),
            sha256: 'new-hash',
        };
        currentDocument = {
            id: 'document-1',
            title: 'Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: previousFile,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        };
        const updatedDocument: UserDocumentRecord = {
            ...currentDocument,
            updatedAt: '2026-01-03T00:00:00.000Z',
            outputFile: newFile,
        };
        replaced = { document: updatedDocument, previousFile };
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            currentDocument,
        );
        mockFileStorage.saveEditedDocument.mockResolvedValue(newFile);
        mockDocumentWriter.replaceDocumentFile.mockResolvedValue(replaced);
        mockFileStorage.removeUserDocument.mockResolvedValue(undefined);
        target = new SaveUserDocumentContentService(
            mockDocumentReader,
            mockDocumentWriter,
            mockFileStorage,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    // Test 1 kiểm tra basename Windows, loại ký tự xuống dòng và key mới trước khi thay file cũ.
    it('should save a new output and remove the previous file after replacement', async () => {
        // Bước 1 - Arrange: dùng đường dẫn Windows do client gửi và file hiện hành READY.
        const expectedSummary = {
            id: 'document-1',
            title: 'Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        };

        // Bước 2 - Act: lưu nội dung đã chỉnh sửa.
        const result = await target.execute(
            'document-1',
            content,
            'C:\\private\\Resume.docx\r\n',
        );

        // Bước 3 - Assert: dùng UUID key, chỉ lưu basename và xóa file cũ sau commit.
        expect(result).toEqual(expectedSummary);
        expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([
            [
                content,
                expect.stringMatching(/^[0-9a-f-]{36}\.docx$/),
                'Resume.docx',
            ],
        ]);
        expect(mockDocumentWriter.replaceDocumentFile.mock.calls).toEqual([
            ['document-1', newFile],
        ]);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [previousFile],
        ]);
        expect(result).not.toHaveProperty('outputFile');
    });

    // Test 2 dừng trước khi ghi file nếu id không tồn tại.
    it('should throw not found without writing when the document does not exist', async () => {
        // Bước 1 - Arrange: reader trả null cho id yêu cầu.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: nhận lỗi 404 và không gọi storage/writer.
        await expect(
            target.execute('missing-id', content, 'Resume.docx'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([]);
        expect(mockDocumentWriter.replaceDocumentFile.mock.calls).toEqual([]);
    });

    // Test 3 trạng thái provisioning và failed đều bị từ chối trước mọi thao tác file.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state before writing',
        async (status) => {
            // Bước 1 - Arrange: tạo document chưa sẵn sàng với output file rỗng.
            mockDocumentReader.findUserDocumentById.mockResolvedValue({
                ...currentDocument,
                status,
                outputFile: null,
            });

            // Bước 2 - Act và Bước 3 - Assert: trả HTTP 409 và không ghi file mới.
            await expect(
                target.execute('document-1', content, 'Resume.docx'),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
            expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([]);
        },
    );

    // Test 4 fail closed khi record báo READY nhưng thiếu file reference hiện hành.
    it('should reject a ready document without an output file reference', async () => {
        // Bước 1 - Arrange: mô phỏng dữ liệu vi phạm database invariant.
        mockDocumentReader.findUserDocumentById.mockResolvedValue({
            ...currentDocument,
            outputFile: null,
        });

        // Bước 2 - Act và Bước 3 - Assert: service không cố thay một reference không tồn tại.
        await expect(
            target.execute('document-1', content, 'Resume.docx'),
        ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
        expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([]);
    });

    // Test 5 storage phải hoàn tất file mới trước transaction; lỗi storage không được gọi writer.
    it('should propagate storage failures before starting the replacement transaction', async () => {
        // Bước 1 - Arrange: filesystem từ chối ghi nội dung mới.
        const failure = new Error('disk unavailable');
        mockFileStorage.saveEditedDocument.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ lỗi gốc và không thay database reference.
        await expect(
            target.execute('document-1', content, 'Resume.docx'),
        ).rejects.toBe(failure);
        expect(mockDocumentWriter.replaceDocumentFile.mock.calls).toEqual([]);
    });

    // Test 6 lỗi transaction phải xóa object mới để tránh orphan, nhưng giữ lỗi transaction gốc.
    it('should remove the new file and propagate replacement failures', async () => {
        // Bước 1 - Arrange: ghi file mới thành công rồi writer reject transaction.
        const failure = new Error('database commit failed');
        mockDocumentWriter.replaceDocumentFile.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: dọn object mới và trả đúng lỗi persistence.
        await expect(
            target.execute('document-1', content, 'Resume.docx'),
        ).rejects.toBe(failure);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [newFile],
        ]);
    });

    // Test 7 cleanup file cũ xảy ra sau commit; lỗi cleanup không làm client mất bản mới.
    it('should return the saved document when removing the previous file fails', async () => {
        // Bước 1 - Arrange: transaction thay file thành công nhưng unlink file cũ lỗi.
        mockFileStorage.removeUserDocument.mockRejectedValue(
            new Error('old file is locked'),
        );

        // Bước 2 - Act: lưu nội dung và để use case thử cleanup file cũ.
        const result = await target.execute(
            'document-1',
            content,
            'Resume.docx',
        );

        // Bước 3 - Assert: response vẫn xác nhận file mới đã được commit.
        expect(result.updatedAt).toBe('2026-01-03T00:00:00.000Z');
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [previousFile],
        ]);
    });

    // Test 8 cleanup file mới lỗi không được che lỗi database thay reference.
    it('should keep the replacement error when cleanup of the new file fails', async () => {
        // Bước 1 - Arrange: writer lỗi và filesystem cũng không xóa được object mới.
        const failure = new Error('database commit failed');
        mockDocumentWriter.replaceDocumentFile.mockRejectedValue(failure);
        mockFileStorage.removeUserDocument.mockRejectedValue(
            new Error('disk unavailable'),
        );

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc vẫn được chuyển tới caller.
        await expect(
            target.execute('document-1', content, 'Resume.docx'),
        ).rejects.toBe(failure);
    });
});
