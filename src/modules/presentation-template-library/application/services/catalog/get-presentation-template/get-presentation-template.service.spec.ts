// Nhóm unit test cho GetPresentationTemplateService: kiểm tra detail public và phản hồi 404 khi không tìm thấy.
// | STT | Test case       | Mục đích                       | Các bước làm                      | Kết quả mong đợi                       |
// |-----|-----------------|--------------------------------|-----------------------------------|----------------------------------------|
// | 1   | Có mẫu          | Trả metadata và slide preview   | Reader trả detail; gọi execute    | Service trả đúng detail                |
// | 2   | Không có mẫu    | Ẩn mẫu private/deleted          | Reader trả null; gọi execute      | Ném PresentationTemplateNotFoundError  |

import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplateNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-not-found.error';
import { GetPresentationTemplateService } from '@/modules/presentation-template-library/application/services/catalog/get-presentation-template/get-presentation-template.service';

describe('GetPresentationTemplateService', () => {
    let target: GetPresentationTemplateService;
    let reader: jest.Mocked<
        Pick<PresentationTemplateReaderContract, 'findPublishedById'>
    >;

    beforeEach(() => {
        reader = { findPublishedById: jest.fn() };
        target = new GetPresentationTemplateService(reader);
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 xác nhận detail bao gồm các slide preview được reader trả về.
    it('should return a published presentation detail', async () => {
        // Bước 1 - Arrange: chuẩn bị detail có ảnh bìa và preview slide đầu.
        const detail = {
            id: 'template-1',
            slug: 'slide-deck',
            name: 'Slide deck',
            category: 'Kinh doanh',
            categoryId: 'category-1',
            description: 'Mẫu PPTX',
            previewUrl: '/api/presentation-templates/template-1/preview',
            slideCount: 4,
            slides: [
                {
                    slideNumber: 1,
                    title: 'Bìa',
                    previewUrl:
                        '/api/presentation-templates/template-1/slides/1/preview',
                },
            ],
            createdAt: '2026-10-30T00:00:00.000Z',
            updatedAt: '2026-10-30T00:00:00.000Z',
        };
        reader.findPublishedById.mockResolvedValue(detail);

        // Bước 2 - Act: yêu cầu detail theo ID.
        const result = await target.execute('template-1');

        // Bước 3 - Assert: service trả nguyên detail và truy vấn đúng một lần.
        expect(result).toEqual(detail);
        expect(reader.findPublishedById.mock.calls).toEqual([['template-1']]);
    });

    // Test 2 coi mẫu không public như không tồn tại để không lộ trạng thái nội bộ.
    it('should throw not found when the template is not public', async () => {
        // Bước 1 - Arrange: reader không trả mẫu cho ID được yêu cầu.
        reader.findPublishedById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: use case phát lỗi 404 ổn định.
        await expect(target.execute('hidden-template')).rejects.toBeInstanceOf(
            PresentationTemplateNotFoundError,
        );
    });
});
