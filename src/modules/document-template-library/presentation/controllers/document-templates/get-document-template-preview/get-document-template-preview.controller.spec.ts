// Nhóm unit test cho GetDocumentTemplatePreviewController: kiểm tra stream ảnh và MIME được giữ nguyên.
// | STT | Test case       | Mục đích                       | Các bước làm                         | Kết quả mong đợi                    |
// |-----|-----------------|--------------------------------|--------------------------------------|-------------------------------------|
// | 1   | Preview hiện hành | Stream ảnh không qua JSON     | Use case trả file; storage mở stream | StreamableFile có MIME và đúng stream |
import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';
import { GetDocumentTemplatePreviewController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template-preview/get-document-template-preview.controller';

describe('GetDocumentTemplatePreviewController', () => {
    let target: GetDocumentTemplatePreviewController;
    let mockGetPreview: jest.Mocked<
        Pick<GetDocumentTemplatePreviewService, 'execute'>
    >;
    let mockFileStorage: jest.Mocked<DocumentFileStorageContract>;

    beforeEach(() => {
        mockGetPreview = { execute: jest.fn() };
        mockFileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        target = new GetDocumentTemplatePreviewController(
            mockGetPreview as unknown as GetDocumentTemplatePreviewService,
            mockFileStorage,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 binary preview dùng MIME metadata và stream do storage adapter cung cấp.
    it('should stream the current preview with its stored MIME type', async () => {
        // Bước 1 - Arrange: use case xác định file hiện hành và storage mở nội dung.
        const file: StoredFileReference = {
            provider: 'local',
            storageNamespace: 'document-template-assets',
            objectKey: 'document-previews/resume.svg',
            originalFilename: 'resume.svg',
            mimeType: 'image/svg+xml',
            sizeBytes: '120',
            sha256: 'hash',
        };
        const stream = Readable.from([Buffer.from('<svg/>')]);
        mockGetPreview.execute.mockResolvedValue({ file });
        mockFileStorage.openReadStream.mockResolvedValue(stream);

        // Bước 2 - Act: gọi endpoint GET /document-templates/:templateId/preview.
        const result = await target.get('template-1');

        // Bước 3 - Assert: response giữ stream binary và MIME lấy từ stored file.
        expect(result).toBeInstanceOf(StreamableFile);
        expect(result.getHeaders()).toMatchObject({ type: 'image/svg+xml' });
        expect(result.getStream()).toBe(stream);
        expect(mockGetPreview.execute.mock.calls).toEqual([['template-1']]);
        expect(mockFileStorage.openReadStream.mock.calls).toEqual([[file]]);
    });
});
