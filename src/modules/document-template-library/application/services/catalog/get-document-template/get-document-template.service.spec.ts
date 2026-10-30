// Nhóm unit test cho GetDocumentTemplateService: xác nhận chi tiết chỉ trả mẫu đã xuất bản và giữ nguyên lỗi đọc dữ liệu.
// | STT | Test case          | Mục đích                            | Các bước làm                          | Kết quả mong đợi                  |
// |-----|--------------------|-------------------------------------|---------------------------------------|-----------------------------------|
// | 1   | Mẫu đã xuất bản    | Trả detail theo template ID         | Reader trả detail; gọi execute với ID | Service trả nguyên detail         |
// | 2   | Mẫu không khả dụng | Không làm lộ mẫu draft hoặc archive | Reader trả null; gọi execute          | Ném DocumentTemplateNotFoundError |
// | 3   | Reader gặp lỗi     | Không đổi lỗi database thành 404    | Reader reject; gọi execute            | Lỗi gốc được truyền lên           |

import { DocumentTemplateNotFoundError } from '@/modules/document-template-library/application/errors/document-template-not-found.error';
import type { DocumentTemplateReaderContract } from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';

describe('GetDocumentTemplateService', () => {
    let target: GetDocumentTemplateService;
    let mockTemplateReader: jest.Mocked<DocumentTemplateReaderContract>;

    beforeEach(() => {
        mockTemplateReader = {
            list: jest.fn(),
            listCategories: jest.fn(),
            findPublishedById: jest.fn(),
            findCurrentPreview: jest.fn(),
            findCurrentSource: jest.fn(),
        };
        target = new GetDocumentTemplateService(mockTemplateReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 kiểm tra service trả nguyên metadata do adapter map từ mẫu đang public.
    it('should return template detail when a published template exists', async () => {
        // Bước 1 - Arrange: chuẩn bị response chi tiết có category, version và timestamp.
        const expected = {
            id: 'template-1',
            slug: 'resume',
            name: 'Resume',
            description: null,
            category: { id: 'category-1', name: 'Career', slug: 'career' },
            isFeatured: true,
            currentVersion: 2,
            previewUrl: '/api/document-templates/template-1/preview',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        };
        mockTemplateReader.findPublishedById.mockResolvedValue(expected);

        // Bước 2 - Act: đọc detail theo UUID.
        const result = await target.execute('template-1');

        // Bước 3 - Assert: giữ nguyên contract và truyền đúng id xuống reader.
        expect(result).toEqual(expected);
        expect(mockTemplateReader.findPublishedById.mock.calls).toEqual([
            ['template-1'],
        ]);
        expect(mockTemplateReader.findPublishedById.mock.calls).toHaveLength(1);
    });

    // Test 2 xác nhận draft/archive được reader ẩn như không tồn tại để tránh lộ nội dung quản trị.
    it('should throw a not-found error when no published template exists', async () => {
        // Bước 1 - Arrange: adapter không tìm được mẫu public tương ứng.
        mockTemplateReader.findPublishedById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: nhận đúng lỗi 404 do application sở hữu.
        await expect(target.execute('hidden-template')).rejects.toBeInstanceOf(
            DocumentTemplateNotFoundError,
        );
        expect(mockTemplateReader.findPublishedById.mock.calls).toEqual([
            ['hidden-template'],
        ]);
    });

    // Test 3 giữ nguyên lỗi database để global filter quyết định response 500.
    it('should propagate reader failures without converting them to not found', async () => {
        // Bước 1 - Arrange: mô phỏng lỗi truy vấn khác với kết quả null.
        const failure = new Error('database unavailable');
        mockTemplateReader.findPublishedById.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ nguyên lỗi hạ tầng, không đổi thành 404.
        await expect(target.execute('template-1')).rejects.toBe(failure);
    });
});
