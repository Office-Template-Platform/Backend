// Nhóm unit test cho GetPresentationTemplatePreviewController: xác nhận ảnh mẫu được mở bằng storage và stream nguyên MIME.
// | STT | Test case      | Mục đích                       | Các bước làm                                | Kết quả mong đợi                       |
// |-----|----------------|--------------------------------|---------------------------------------------|----------------------------------------|
// | 1   | Có preview     | Stream thumbnail của mẫu       | Service trả file; storage mở stream         | Trả StreamableFile với đúng file/MIME  |

import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { DocumentFileStorageContract } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetPresentationTemplatePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template-preview/get-presentation-template-preview.service';
import { GetPresentationTemplatePreviewController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/get-presentation-template-preview/get-presentation-template-preview.controller';

describe('GetPresentationTemplatePreviewController', () => {
    it('should stream the thumbnail using the stored MIME type', async () => {
        // Bước 1 - Arrange: use case xác thực file và storage tạo Readable stream.
        const file = {
            provider: 'local' as const,
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/preview.webp',
            originalFilename: 'deck.webp',
            mimeType: 'image/webp',
            sizeBytes: '100',
            sha256: null,
        };
        const stream = Readable.from(['preview']);
        const execute = jest.fn().mockResolvedValue({ file });
        const service = {
            execute,
        } as unknown as GetPresentationTemplatePreviewService;
        const openReadStream = jest.fn().mockResolvedValue(stream);
        const storage = {
            openReadStream,
        } as unknown as DocumentFileStorageContract;
        const target = new GetPresentationTemplatePreviewController(
            service,
            storage,
        );

        // Bước 2 - Act: yêu cầu thumbnail theo template ID.
        const response = await target.get('template-1');

        // Bước 3 - Assert: bytes không bị bọc JSON và MIME lấy từ StoredFile.
        expect(response).toBeInstanceOf(StreamableFile);
        expect(execute.mock.calls).toEqual([['template-1']]);
        expect(openReadStream.mock.calls).toEqual([[file]]);
        expect(response.getHeaders().type).toBe('image/webp');
    });
});
