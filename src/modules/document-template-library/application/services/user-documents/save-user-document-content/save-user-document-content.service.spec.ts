// Nhóm unit test cho SaveUserDocumentContentService: xác nhận thay file theo thứ tự an toàn và chỉ dọn file cũ sau khi database commit.
// | STT | Test case                     | Mục đích                              | Các bước làm                                           | Kết quả mong đợi                          |
// |-----|-------------------------------|---------------------------------------|--------------------------------------------------------|-------------------------------------------|
// | 1   | READY và thay file thành công | Lưu nội dung mới, dọn output cũ       | Reader trả READY; storage ghi file mới; writer replace | Trả summary mới và xóa file cũ sau commit |
// | 2   | Document không tồn tại        | Dừng trước khi ghi file               | Reader trả null; gọi execute                           | Ném not-found, storage không chạy         |
// | 3   | Document chưa sẵn sàng        | Chặn thay file thiếu output           | Reader trả trạng thái không READY hoặc thiếu file      | Ném UserDocumentNotReadyError             |
// | 4   | Storage ghi lỗi               | Không mở transaction khi chưa có file | Reader hợp lệ; storage save reject                     | Truyền lỗi, writer không chạy             |
// | 5   | Writer replace lỗi            | Dọn file mới chưa được tham chiếu     | Storage ghi file; writer replace reject                | Xóa file mới rồi truyền lỗi writer lên    |
// | 6   | Dọn file cũ lỗi               | Giữ bản mới đã commit                 | Replace thành công; xóa file cũ reject                 | Trả summary mới, không rollback bản mới   |
// | 7   | Dọn file mới cũng lỗi         | Giữ lỗi thay file ban đầu             | Replace reject; cleanup file mới cũng reject           | Lỗi replace gốc không bị che              |
// | 9   | Bản PPTX                       | Lưu file đã sửa cùng định dạng PPTX    | Reader trả READY/PPTX; gọi save                         | Thay output PPTX và dọn file cũ sau commit          |

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
    let mockDocumentReader: jest.Mocked<
        Pick<
            UserDocumentReaderContract,
            'findUserDocumentById' | 'findUserDocumentByIdForWorkspace'
        >
    >;
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
        mockDocumentReader = {
            findUserDocumentById: jest.fn(),
            findUserDocumentByIdForWorkspace: jest.fn(),
        };
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
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
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
        const result = await target.executeForWorkspace(
            'document-1',
            'workspace-1',
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
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
            null,
        );

        // Bước 2 - Act và Bước 3 - Assert: nhận lỗi 404 và không gọi storage/writer.
        await expect(
            target.executeForWorkspace(
                'missing-id',
                'workspace-1',
                content,
                'Resume.docx',
            ),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([]);
        expect(mockDocumentWriter.replaceDocumentFile.mock.calls).toEqual([]);
    });

    // Test 3 trạng thái provisioning và failed đều bị từ chối trước mọi thao tác file.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state before writing',
        async (status) => {
            // Bước 1 - Arrange: tạo document chưa sẵn sàng với output file rỗng.
            mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
                {
                    ...currentDocument,
                    status,
                    outputFile: null,
                },
            );

            // Bước 2 - Act và Bước 3 - Assert: trả HTTP 409 và không ghi file mới.
            await expect(
                target.executeForWorkspace(
                    'document-1',
                    'workspace-1',
                    content,
                    'Resume.docx',
                ),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
            expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([]);
        },
    );

    // Test 4 fail closed khi record báo READY nhưng thiếu file reference hiện hành.
    it('should reject a ready document without an output file reference', async () => {
        // Bước 1 - Arrange: mô phỏng dữ liệu vi phạm database invariant.
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue({
            ...currentDocument,
            outputFile: null,
        });

        // Bước 2 - Act và Bước 3 - Assert: service không cố thay một reference không tồn tại.
        await expect(
            target.executeForWorkspace(
                'document-1',
                'workspace-1',
                content,
                'Resume.docx',
            ),
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
            target.executeForWorkspace(
                'document-1',
                'workspace-1',
                content,
                'Resume.docx',
            ),
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
            target.executeForWorkspace(
                'document-1',
                'workspace-1',
                content,
                'Resume.docx',
            ),
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
        const result = await target.executeForWorkspace(
            'document-1',
            'workspace-1',
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
            target.executeForWorkspace(
                'document-1',
                'workspace-1',
                content,
                'Resume.docx',
            ),
        ).rejects.toBe(failure);
    });

    // Test 9 giữ định dạng PPTX khi thay file; file cũ chỉ được dọn sau khi writer commit.
    it('should replace a ready PPTX with another PPTX', async () => {
        // Bước 1 - Arrange: reader, storage và writer cùng trả metadata đúng định dạng PPTX.
        const pptxMimeType =
            'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        const previousPptxFile = {
            ...currentDocument.outputFile!,
            objectKey: 'presentations/deck.pptx',
            originalFilename: 'deck.pptx',
            mimeType: pptxMimeType,
        };
        const updatedPptxFile = {
            ...newFile,
            objectKey: 'presentations/deck-updated.pptx',
            originalFilename: 'deck.pptx',
            mimeType: pptxMimeType,
        };
        const updatedPptxDocument = {
            ...currentDocument,
            updatedAt: '2026-01-03T00:00:00.000Z',
            outputFile: updatedPptxFile,
        };
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue({
            ...currentDocument,
            outputFile: previousPptxFile,
        });
        mockFileStorage.saveEditedDocument.mockResolvedValue(updatedPptxFile);
        mockDocumentWriter.replaceDocumentFile.mockResolvedValue({
            document: updatedPptxDocument,
            previousFile: previousPptxFile,
        });

        // Bước 2 - Act: cập nhật bản trình chiếu bằng file cùng định dạng.
        const result = await target.executeForWorkspace(
            'document-1',
            'workspace-1',
            content,
            'deck.pptx',
        );

        // Bước 3 - Assert: lưu key PPTX mới, thay reference và dọn file cũ sau commit.
        expect(result.updatedAt).toBe('2026-01-03T00:00:00.000Z');
        expect(mockFileStorage.saveEditedDocument.mock.calls).toEqual([
            [content, expect.stringMatching(/\.pptx$/), 'deck.pptx'],
        ]);
        expect(mockDocumentWriter.replaceDocumentFile.mock.calls).toEqual([
            ['document-1', updatedPptxFile, undefined],
        ]);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [previousPptxFile],
        ]);
    });
});
