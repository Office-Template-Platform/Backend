// Nhóm unit test cho ListDocumentTemplatesController: kiểm tra query được chuyển nguyên vẹn sang use case.
// | STT | Test case       | Mục đích                       | Các bước làm                    | Kết quả mong đợi                 |
// |-----|-----------------|--------------------------------|---------------------------------|----------------------------------|
// | 1   | Query catalog   | Giữ nguyên bộ lọc đã validate  | Gọi list với query DTO          | Use case nhận đúng DTO và result |
import { ListDocumentTemplatesService } from '@/modules/document-template-library/application/services/catalog/list-document-templates/list-document-templates.service';
import { ListDocumentTemplatesController } from '@/modules/document-template-library/presentation/controllers/document-templates/list-document-templates/list-document-templates.controller';
import { ListDocumentTemplatesQueryDto } from '@/modules/document-template-library/presentation/dto/list-document-templates-query/list-document-templates-query.dto';

describe('ListDocumentTemplatesController', () => {
    let target: ListDocumentTemplatesController;
    let mockListTemplates: jest.Mocked<
        Pick<ListDocumentTemplatesService, 'execute'>
    >;

    beforeEach(() => {
        mockListTemplates = { execute: jest.fn() };
        target = new ListDocumentTemplatesController(
            mockListTemplates as unknown as ListDocumentTemplatesService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 bảo đảm controller không tự sửa pagination hoặc filter trước use case.
    it('should delegate the validated catalog query unchanged', async () => {
        // Bước 1 - Arrange: tạo query DTO có pagination và các filter catalog.
        const query = Object.assign(new ListDocumentTemplatesQueryDto(), {
            page: 2,
            limit: 8,
            search: 'resume',
            categoryId: 'category-1',
            featured: false,
        });
        const expected = {
            items: [],
            total: 0,
            page: 2,
            limit: 8,
            totalPages: 0,
        };
        mockListTemplates.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi handler của endpoint GET /document-templates.
        const result = await target.list(query);

        // Bước 3 - Assert: trả result của use case và chuyển đúng cùng DTO.
        expect(result).toEqual(expected);
        expect(mockListTemplates.execute.mock.calls).toEqual([[query]]);
    });
});
