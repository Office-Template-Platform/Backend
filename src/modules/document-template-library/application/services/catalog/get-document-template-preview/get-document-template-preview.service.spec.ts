// Nhóm unit test cho GetDocumentTemplatePreviewService: xác nhận preview dùng file của phiên bản hiện hành và phân biệt not-found với lỗi reader.
// | STT | Test case       | Mục đích                                | Các bước làm                           | Kết quả mong đợi                         |
// |-----|-----------------|-----------------------------------------|----------------------------------------|------------------------------------------|
// | 1   | Preview tồn tại | Cấp reference ảnh cho controller stream | Reader trả file reference; gọi execute | Trả đúng reference của current preview   |
// | 2   | Thiếu preview   | Báo không tìm thấy thumbnail            | Reader trả null; gọi execute           | Ném DocumentTemplatePreviewNotFoundError |
// | 3   | Reader gặp lỗi  | Giữ nguyên lỗi hạ tầng                  | Reader reject; gọi execute             | Lỗi gốc được truyền lên                  |

import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import type { DocumentTemplateReaderContract } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { DocumentTemplatePreviewNotFoundError } from '@/modules/document-template-library/application/errors/document-template-preview-not-found.error';
import { GetDocumentTemplatePreviewService } from '@/modules/document-template-library/application/services/catalog/get-document-template-preview/get-document-template-preview.service';

describe('GetDocumentTemplatePreviewService', () => {
    let target: GetDocumentTemplatePreviewService;
    let mockTemplateReader: jest.Mocked<DocumentTemplateReaderContract>;

    beforeEach(() => {
        mockTemplateReader = {
            list: jest.fn(),
            listCategories: jest.fn(),
            findPublishedById: jest.fn(),
            findCurrentPreview: jest.fn(),
            findCurrentSource: jest.fn(),
        };
        target = new GetDocumentTemplatePreviewService(mockTemplateReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận use case không mở stream, chỉ trả reference nội bộ cho controller.
    it('should return the current preview file reference when one exists', async () => {
        // Bước 1 - Arrange: chuẩn bị metadata PNG của preview hiện hành.
        const file: StoredFileReference = {
            provider: 'local',
            storageNamespace: 'document-template-assets',
            objectKey: 'previews/resume.svg',
            originalFilename: 'resume.svg',
            mimeType: 'image/svg+xml',
            sizeBytes: '128',
            sha256: 'abc123',
        };
        mockTemplateReader.findCurrentPreview.mockResolvedValue(file);

        // Bước 2 - Act: lấy file reference của mẫu.
        const result = await target.execute('template-1');

        // Bước 3 - Assert: trả reference đúng và tra cứu theo id yêu cầu.
        expect(result).toEqual({ file });
        expect(mockTemplateReader.findCurrentPreview.mock.calls).toEqual([
            ['template-1'],
        ]);
    });

    // Test 2 xác nhận mẫu thiếu thumbnail không tạo ra file giả hoặc gọi storage.
    it('should throw a preview not-found error when the current version has no image', async () => {
        // Bước 1 - Arrange: adapter không tìm được preview cho mẫu.
        mockTemplateReader.findCurrentPreview.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: báo lỗi 404 chuyên biệt cho ảnh preview.
        await expect(target.execute('template-1')).rejects.toBeInstanceOf(
            DocumentTemplatePreviewNotFoundError,
        );
        expect(mockTemplateReader.findCurrentPreview.mock.calls).toHaveLength(
            1,
        );
    });

    // Test 3 phân biệt lỗi truy vấn với thumbnail thật sự không tồn tại.
    it('should propagate reader failures without converting them to not found', async () => {
        // Bước 1 - Arrange: reader reject do database chưa sẵn sàng.
        const failure = new Error('database unavailable');
        mockTemplateReader.findCurrentPreview.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: exception gốc tiếp tục tới exception filter.
        await expect(target.execute('template-1')).rejects.toBe(failure);
    });
});
