// Nhóm unit test cho CreateUserPresentationService: kiểm tra copy độc lập, workspace, tên file và bù trừ khi thất bại.
// | STT | Test case              | Mục đích                                  | Các bước làm                                          | Kết quả mong đợi                                  |
// |-----|------------------------|-------------------------------------------|-------------------------------------------------------|---------------------------------------------------|
// | 1   | Tạo bản sao thành công | Ghim version và lưu bản PPTX riêng         | Reader có source; storage copy; writer complete       | Trả summary READY và key .pptx riêng              |
// | 2   | Mẫu không tồn tại      | Dừng trước thao tác lưu                   | Reader trả null; gọi execute                          | Ném 404, writer/storage không chạy                |
// | 3   | Copy file lỗi          | Đánh dấu provisioning thất bại            | Reader có source; storage reject                      | Ném lỗi tạo bản sao, record được đánh dấu FAILED  |
// | 4   | Complete lỗi           | Dọn file mới và giữ nguồn bất biến        | Copy thành công; writer complete reject               | Xóa file user, đánh dấu FAILED, ném lỗi ổn định   |

import { Logger } from '@nestjs/common';
import type { DocumentFileStorageContract } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import type { UserDocumentWriterContract } from '@/modules/user-document-management/application/contracts/user-document-writer.contract';
import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationCreationFailedError } from '@/modules/presentation-template-library/application/errors/presentation-creation-failed.error';
import { PresentationTemplateNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-not-found.error';
import { CreateUserPresentationService } from '@/modules/presentation-template-library/application/services/user-presentations/create-user-presentation/create-user-presentation.service';

describe('CreateUserPresentationService', () => {
    let target: CreateUserPresentationService;
    let templateReader: jest.Mocked<
        Pick<PresentationTemplateReaderContract, 'findCurrentSource'>
    >;
    let documentWriter: jest.Mocked<UserDocumentWriterContract>;
    let fileStorage: jest.Mocked<DocumentFileStorageContract>;
    let logError: jest.SpyInstance;
    const sourceFile = {
        provider: 'local' as const,
        storageNamespace: 'presentation-template-assets',
        objectKey: 'presentation-templates/deck/file.pptx',
        originalFilename: 'deck.pptx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: '1024',
        sha256: 'source-hash',
    };
    const outputFile = {
        ...sourceFile,
        storageNamespace: 'user-presentations',
        objectKey: 'documents/new-copy.pptx',
        originalFilename: 'Bài thuyết trình.pptx',
        sha256: 'output-hash',
    };

    beforeEach(() => {
        templateReader = { findCurrentSource: jest.fn() };
        documentWriter = {
            createProvisioningDocument: jest.fn(),
            completeDocument: jest.fn(),
            replaceDocumentFile: jest.fn(),
            markDocumentFailed: jest.fn(),
        };
        fileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        logError = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        target = new CreateUserPresentationService(
            templateReader,
            documentWriter,
            fileStorage,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Test 1 xác nhận bản sao được tạo sau khi ghi provisioning và không dùng source key làm output key.
    it('should create an independent PPTX copy and return its summary', async () => {
        // Bước 1 - Arrange: reader trả current version; writer/storage giả lập pipeline thành công.
        templateReader.findCurrentSource.mockResolvedValue({
            templateId: 'template-1',
            templateName: 'Bài thuyết trình',
            versionId: 'version-1',
            sourceFile,
        });
        documentWriter.createProvisioningDocument.mockResolvedValue(
            'document-1',
        );
        fileStorage.copyTemplateFile.mockResolvedValue(outputFile);
        documentWriter.completeDocument.mockResolvedValue({
            id: 'document-1',
            title: 'Bài thuyết trình mới',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-10-30T00:00:00.000Z',
            updatedAt: '2026-10-30T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile,
            sourceTemplate: {
                id: 'template-1',
                name: 'Bài thuyết trình',
                version: 1,
            },
        });

        // Bước 2 - Act: tạo bản sao trong workspace và dùng title đã trim.
        const result = await target.execute(
            'template-1',
            'workspace-1',
            '  Bài thuyết trình mới  ',
        );

        // Bước 3 - Assert: provisioning gắn version/workspace và file đích có UUID .pptx.
        expect(documentWriter.createProvisioningDocument.mock.calls).toEqual([
            ['version-1', 'Bài thuyết trình mới', 'workspace-1'],
        ]);
        expect(fileStorage.copyTemplateFile.mock.calls).toEqual([
            [
                sourceFile,
                expect.stringMatching(/^[0-9a-f-]+\.pptx$/),
                'Bài thuyết trình mới.pptx',
            ],
        ]);
        const copiedKey = fileStorage.copyTemplateFile.mock.calls[0]?.[1];
        expect(copiedKey).not.toBe(sourceFile.objectKey);
        expect(result).toEqual({
            id: 'document-1',
            title: 'Bài thuyết trình mới',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-10-30T00:00:00.000Z',
            updatedAt: '2026-10-30T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: {
                id: 'template-1',
                name: 'Bài thuyết trình',
                version: 1,
            },
        });
        expect(fileStorage.removeUserDocument.mock.calls).toEqual([]);
    });

    // Test 2 không tạo provisioning hoặc đụng filesystem khi source không còn public.
    it('should stop before writing when the presentation does not exist', async () => {
        // Bước 1 - Arrange: reader coi mẫu không tồn tại/không public là null.
        templateReader.findCurrentSource.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: trả lỗi 404 trước mọi side effect.
        await expect(
            target.execute('hidden-template', 'workspace-1'),
        ).rejects.toBeInstanceOf(PresentationTemplateNotFoundError);
        expect(documentWriter.createProvisioningDocument.mock.calls).toEqual(
            [],
        );
        expect(fileStorage.copyTemplateFile.mock.calls).toEqual([]);
    });

    // Test 3 chuyển provisioning sang FAILED nếu copy source không tạo được output file.
    it('should mark the provisioning record failed when copying the PPTX fails', async () => {
        // Bước 1 - Arrange: cấp source và provisioning nhưng storage không copy được file.
        templateReader.findCurrentSource.mockResolvedValue({
            templateId: 'template-1',
            templateName: 'Bài thuyết trình',
            versionId: 'version-1',
            sourceFile,
        });
        documentWriter.createProvisioningDocument.mockResolvedValue(
            'document-1',
        );
        fileStorage.copyTemplateFile.mockRejectedValue(
            new Error('source file unavailable'),
        );

        // Bước 2 - Act và Bước 3 - Assert: API nhận lỗi ổn định và record được đánh dấu failed.
        await expect(
            target.execute('template-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(PresentationCreationFailedError);
        expect(documentWriter.markDocumentFailed.mock.calls).toEqual([
            ['document-1', 'PRESENTATION_CREATION_FAILED'],
        ]);
        expect(fileStorage.removeUserDocument.mock.calls).toEqual([]);
    });

    // Test 4 dọn đúng output mới nếu commit READY lỗi và không xóa source mẫu.
    it('should clean the copied PPTX and mark failure when completion fails', async () => {
        // Bước 1 - Arrange: copy thành công nhưng writer không hoàn tất record READY.
        templateReader.findCurrentSource.mockResolvedValue({
            templateId: 'template-1',
            templateName: 'Bài thuyết trình',
            versionId: 'version-1',
            sourceFile,
        });
        documentWriter.createProvisioningDocument.mockResolvedValue(
            'document-1',
        );
        fileStorage.copyTemplateFile.mockResolvedValue(outputFile);
        documentWriter.completeDocument.mockRejectedValue(
            new Error('database commit failed'),
        );

        // Bước 2 - Act và Bước 3 - Assert: compensation xóa output user, giữ source và ném lỗi API ổn định.
        await expect(
            target.execute('template-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(PresentationCreationFailedError);
        expect(fileStorage.removeUserDocument.mock.calls).toEqual([
            [outputFile],
        ]);
        expect(documentWriter.markDocumentFailed.mock.calls).toEqual([
            ['document-1', 'PRESENTATION_CREATION_FAILED'],
        ]);
        expect(logError).toHaveBeenCalled();
    });
});
