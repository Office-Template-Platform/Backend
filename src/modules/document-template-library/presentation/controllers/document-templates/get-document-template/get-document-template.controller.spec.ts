// Nhóm unit test cho GetDocumentTemplateController: kiểm tra templateId được chuyển sang use case chi tiết.
// | STT | Test case      | Mục đích                       | Các bước làm          | Kết quả mong đợi             |
// |-----|----------------|--------------------------------|-----------------------|------------------------------|
// | 1   | Mẫu tồn tại    | Trả metadata và version hiện hành | Gọi get với UUID     | Trả nguyên kết quả use case  |
import { GetDocumentTemplateService } from '@/modules/document-template-library/application/services/catalog/get-document-template/get-document-template.service';
import { GetDocumentTemplateController } from '@/modules/document-template-library/presentation/controllers/document-templates/get-document-template/get-document-template.controller';

describe('GetDocumentTemplateController', () => {
    let target: GetDocumentTemplateController;
    let mockGetTemplate: jest.Mocked<
        Pick<GetDocumentTemplateService, 'execute'>
    >;

    beforeEach(() => {
        mockGetTemplate = { execute: jest.fn() };
        target = new GetDocumentTemplateController(
            mockGetTemplate as unknown as GetDocumentTemplateService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận UUID được chuyển nguyên vẹn và detail không bị map tại HTTP boundary.
    it('should return template details for the requested id', async () => {
        // Bước 1 - Arrange: chuẩn bị metadata chi tiết từ application.
        const expected = {
            id: 'template-1',
            slug: 'resume',
            name: 'Resume',
            description: null,
            category: { id: 'category-1', name: 'Career', slug: 'career' },
            isFeatured: false,
            currentVersion: 1,
            previewUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        };
        mockGetTemplate.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi endpoint GET /document-templates/:templateId.
        const result = await target.get('template-1');

        // Bước 3 - Assert: trả metadata và tra đúng template id.
        expect(result).toEqual(expected);
        expect(mockGetTemplate.execute.mock.calls).toEqual([['template-1']]);
    });
});
