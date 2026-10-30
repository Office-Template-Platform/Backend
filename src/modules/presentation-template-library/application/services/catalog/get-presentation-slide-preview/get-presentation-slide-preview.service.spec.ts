// Nhóm unit test cho GetPresentationSlidePreviewService: kiểm tra số slide dương và file preview thuộc mẫu public.
// | STT | Test case        | Mục đích                    | Các bước làm                         | Kết quả mong đợi                             |
// |-----|------------------|-----------------------------|--------------------------------------|----------------------------------------------|
// | 1   | Slide có preview | Trả file của đúng slide      | Reader trả file; gọi execute         | Trả reference và truyền đúng slide number    |
// | 2   | Số slide sai     | Chặn input trước truy vấn    | Gọi execute với số 0                  | Ném BadRequestException, reader không chạy   |
// | 3   | Không có preview | Báo ảnh slide không tồn tại  | Reader trả null; gọi execute         | Ném PresentationTemplatePreviewNotFoundError |

import { BadRequestException } from '@nestjs/common';
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplatePreviewNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-preview-not-found.error';
import { GetPresentationSlidePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-slide-preview/get-presentation-slide-preview.service';

describe('GetPresentationSlidePreviewService', () => {
    let target: GetPresentationSlidePreviewService;
    let reader: jest.Mocked<
        Pick<PresentationTemplateReaderContract, 'findSlidePreview'>
    >;

    beforeEach(() => {
        reader = { findSlidePreview: jest.fn() };
        target = new GetPresentationSlidePreviewService(reader);
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 đảm bảo file trả về khớp template ID và slide number đã yêu cầu.
    it('should return the preview for the requested slide', async () => {
        // Bước 1 - Arrange: reader có file preview tại slide số 2.
        const file: StoredFileReference = {
            provider: 'local',
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/slides/2.webp',
            originalFilename: 'slide-2.webp',
            mimeType: 'image/webp',
            sizeBytes: '256',
            sha256: null,
        };
        reader.findSlidePreview.mockResolvedValue(file);

        // Bước 2 - Act: lấy preview slide 2 của template.
        const result = await target.execute('template-1', 2);

        // Bước 3 - Assert: truyền đúng tọa độ và trả đúng reference.
        expect(reader.findSlidePreview.mock.calls).toEqual([['template-1', 2]]);
        expect(result).toEqual({ file });
    });

    // Test 2 từ chối số không nguyên dương trước khi có truy vấn đến reader.
    it('should reject a non-positive slide number before reading', async () => {
        // Bước 1 - Arrange: không cần cấu hình reader vì nhánh validation phải dừng sớm.

        // Bước 2 - Act và Bước 3 - Assert: số slide 0 báo 400 và không gọi database.
        await expect(target.execute('template-1', 0)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(reader.findSlidePreview.mock.calls).toEqual([]);
    });

    // Test 3 báo 404 khi slide hợp lệ nhưng chưa có file preview được đăng ký.
    it('should throw when the requested slide has no preview', async () => {
        // Bước 1 - Arrange: reader không tìm thấy file ở slide 3.
        reader.findSlidePreview.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: không tạo URL giả cho ảnh chưa có.
        await expect(target.execute('template-1', 3)).rejects.toBeInstanceOf(
            PresentationTemplatePreviewNotFoundError,
        );
    });
});
