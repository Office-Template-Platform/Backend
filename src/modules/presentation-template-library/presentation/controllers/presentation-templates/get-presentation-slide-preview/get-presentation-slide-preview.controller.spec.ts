// Nhóm unit test cho GetPresentationSlidePreviewController: xác nhận template ID và slide number được giữ đúng khi stream.
// | STT | Test case        | Mục đích                       | Các bước làm                                | Kết quả mong đợi                        |
// |-----|------------------|--------------------------------|---------------------------------------------|-----------------------------------------|
// | 1   | Slide có preview | Trả ảnh của đúng slide          | Service trả file; storage mở stream         | StreamableFile và đúng tọa độ slide     |

import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { DocumentFileStorageContract } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetPresentationSlidePreviewService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-slide-preview/get-presentation-slide-preview.service';
import { GetPresentationSlidePreviewController } from '@/modules/presentation-template-library/presentation/controllers/presentation-templates/get-presentation-slide-preview/get-presentation-slide-preview.controller';

describe('GetPresentationSlidePreviewController', () => {
    it('should stream the requested slide preview', async () => {
        // Bước 1 - Arrange: service đã xác thực slide; storage trả stream WebP.
        const file = {
            provider: 'local' as const,
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/slides/2.webp',
            originalFilename: 'slide-2.webp',
            mimeType: 'image/webp',
            sizeBytes: '100',
            sha256: null,
        };
        const execute = jest.fn().mockResolvedValue({ file });
        const service = {
            execute,
        } as unknown as GetPresentationSlidePreviewService;
        const openReadStream = jest
            .fn()
            .mockResolvedValue(Readable.from(['slide']));
        const storage = {
            openReadStream,
        } as unknown as DocumentFileStorageContract;
        const target = new GetPresentationSlidePreviewController(
            service,
            storage,
        );

        // Bước 2 - Act: lấy preview slide 2 của template.
        const response = await target.get('template-1', 2);

        // Bước 3 - Assert: service nhận đúng tọa độ và controller trả binary stream.
        expect(response).toBeInstanceOf(StreamableFile);
        expect(execute.mock.calls).toEqual([['template-1', 2]]);
        expect(openReadStream.mock.calls).toEqual([[file]]);
    });
});
