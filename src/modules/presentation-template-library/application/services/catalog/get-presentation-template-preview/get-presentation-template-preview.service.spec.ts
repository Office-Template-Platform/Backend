// Nhóm unit test cho GetPresentationTemplatePreviewService: xác nhận thumbnail chỉ được trả khi reader tìm thấy file.
// | STT | Test case       | Mục đích                      | Các bước làm                      | Kết quả mong đợi                            |
// |-----|-----------------|-------------------------------|-----------------------------------|---------------------------------------------|
// | 1   | Có thumbnail    | Trả file reference cho stream  | Reader trả file; gọi execute     | Trả reference không lộ path ra ngoài         |
// | 2   | Thiếu thumbnail | Báo preview không tồn tại      | Reader trả null; gọi execute     | Ném PresentationTemplatePreviewNotFoundError |

import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplatePreviewNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-preview-not-found.error';
import { GetPresentationTemplatePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template-preview/get-presentation-template-preview.service';

describe('GetPresentationTemplatePreviewService', () => {
    let target: GetPresentationTemplatePreviewService;
    let reader: jest.Mocked<
        Pick<PresentationTemplateReaderContract, 'findCurrentPreview'>
    >;

    beforeEach(() => {
        reader = { findCurrentPreview: jest.fn() };
        target = new GetPresentationTemplatePreviewService(reader);
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 kiểm tra use case chỉ trả reference từ phiên bản public hiện hành.
    it('should return the current thumbnail reference', async () => {
        // Bước 1 - Arrange: reader tìm được ảnh WebP trong presentation namespace.
        const file: StoredFileReference = {
            provider: 'local',
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/preview.webp',
            originalFilename: 'deck.webp',
            mimeType: 'image/webp',
            sizeBytes: '128',
            sha256: null,
        };
        reader.findCurrentPreview.mockResolvedValue(file);

        // Bước 2 - Act: lấy thumbnail theo template ID.
        const result = await target.execute('template-1');

        // Bước 3 - Assert: controller nhận file reference để mở stream.
        expect(result).toEqual({ file });
    });

    // Test 2 báo 404 khi thumbnail bị thiếu, không trả storage path dự đoán.
    it('should throw when no current thumbnail exists', async () => {
        // Bước 1 - Arrange: reader không tìm thấy thumbnail của mẫu public.
        reader.findCurrentPreview.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: lỗi preview được phát ra rõ ràng.
        await expect(target.execute('template-1')).rejects.toBeInstanceOf(
            PresentationTemplatePreviewNotFoundError,
        );
    });
});
