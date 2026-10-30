// Nhóm unit test cho ListPresentationTemplatesService: xác nhận filter được chuyển nguyên vẹn và lỗi reader được giữ nguyên.
// | STT | Test case       | Mục đích                         | Các bước làm                              | Kết quả mong đợi                    |
// |-----|-----------------|----------------------------------|-------------------------------------------|-------------------------------------|
// | 1   | Có mẫu          | Trả các mẫu theo filter catalog  | Reader trả mảng; gọi execute với filters  | Service trả đúng mảng và filter     |
// | 2   | Không có mẫu    | Giữ kết quả rỗng                 | Reader trả []; gọi execute                | Service trả []                      |
// | 3   | Reader lỗi      | Không che lỗi persistence        | Reader reject; gọi execute                | Lỗi gốc được truyền lên             |

import type { PresentationTemplateReaderContract } from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import type { PresentationTemplateSummary } from '@/modules/presentation-template-library/application/types/presentation-template-summary';
import { ListPresentationTemplatesService } from '@/modules/presentation-template-library/application/services/catalog/list-presentation-templates/list-presentation-templates.service';

describe('ListPresentationTemplatesService', () => {
    let target: ListPresentationTemplatesService;
    let reader: jest.Mocked<Pick<PresentationTemplateReaderContract, 'list'>>;

    beforeEach(() => {
        reader = { list: jest.fn() };
        target = new ListPresentationTemplatesService(reader);
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 kiểm tra search/categoryId được chuyển nguyên vẹn đến reader.
    it('should return templates matching the requested filters', async () => {
        // Bước 1 - Arrange: chuẩn bị filter và một mẫu public có metadata catalog.
        const filters = { search: 'giọt nước', categoryId: 'category-1' };
        const expected: PresentationTemplateSummary[] = [
            {
                id: 'template-1',
                name: 'Thiết kế giọt nước',
                category: 'Sự kiện',
                description: 'Mẫu trình chiếu',
                previewUrl: '/api/presentation-templates/template-1/preview',
                slideCount: 14,
            },
        ];
        reader.list.mockResolvedValue(expected);

        // Bước 2 - Act: gọi use case bằng các filter đã được DTO xác thực.
        const result = await target.execute(filters);

        // Bước 3 - Assert: trả nguyên danh sách và chỉ gọi reader một lần.
        expect(result).toEqual(expected);
        expect(reader.list.mock.calls).toEqual([[filters]]);
    });

    // Test 2 đảm bảo catalog không match vẫn trả mảng rỗng thay vì báo lỗi.
    it('should return an empty array when no template matches', async () => {
        // Bước 1 - Arrange: reader không tìm được mẫu theo filter.
        reader.list.mockResolvedValue([]);

        // Bước 2 - Act: yêu cầu catalog bằng search không có kết quả.
        const result = await target.execute({ search: 'không có' });

        // Bước 3 - Assert: kết quả rỗng được giữ nguyên.
        expect(result).toEqual([]);
    });

    // Test 3 bảo đảm lỗi adapter không bị biến thành danh sách rỗng.
    it('should propagate reader errors unchanged', async () => {
        // Bước 1 - Arrange: reader giả lập lỗi database.
        const failure = new Error('database unavailable');
        reader.list.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: use case truyền đúng lỗi gốc lên caller.
        await expect(target.execute({})).rejects.toBe(failure);
    });
});
