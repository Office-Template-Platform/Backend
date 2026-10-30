// Nhóm unit test cho TypeOrmDocumentTemplateReaderRepository: kiểm tra filter SQL, pagination và mapping read model.
// | STT | Test case          | Mục đích                           | Các bước làm                               | Kết quả mong đợi                              |
// |-----|--------------------|------------------------------------|--------------------------------------------|------------------------------------------------|
// | 1   | Có mẫu và filters  | Bind filter, sort và phân trang     | Query trả entity; gọi list                 | SQL nhận params an toàn, metadata đúng         |
// | 2   | Trang rỗng          | Tính tổng trang khi không có mẫu    | Query trả [], total 0                      | items rỗng, totalPages 0                       |
// | 3   | Có danh mục         | Chuyển COUNT từ Postgres sang number| Query trả count string                     | templateCount là number                       |
// | 4   | Detail có mẫu       | Map trường public và ngày ISO       | Query trả entity với joins                 | Detail đúng, previewUrl có path API             |
// | 5   | Detail không có     | Ẩn mẫu private/deleted             | Query trả null                              | Trả null                                       |
// | 6   | Có source/preview   | Ghim đúng current version và files | Query trả current version                  | Source và preview reference chính xác           |
import { Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { TypeOrmDocumentTemplateReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/document-templates/typeorm-document-template-reader.repository';

// Tạo query builder giả có cùng fluent API để kiểm tra adapter mà không mở PostgreSQL thật.
function createQueryBuilderMock(): Record<string, jest.Mock> {
    const builder: Record<string, jest.Mock> = {};
    const chainMethods = [
        'innerJoinAndSelect',
        'leftJoinAndSelect',
        'leftJoin',
        'select',
        'addSelect',
        'where',
        'andWhere',
        'groupBy',
        'orderBy',
        'addOrderBy',
        'skip',
        'take',
    ];

    for (const method of chainMethods) {
        builder[method] = jest.fn().mockReturnValue(builder);
    }

    builder.getManyAndCount = jest.fn();
    builder.getRawMany = jest.fn();
    builder.getOne = jest.fn();
    return builder;
}

describe('TypeOrmDocumentTemplateReaderRepository', () => {
    let target: TypeOrmDocumentTemplateReaderRepository;
    let mockTemplateQuery: Record<string, jest.Mock>;
    let mockCategoryQuery: Record<string, jest.Mock>;
    let mockTemplates: jest.Mocked<
        Pick<Repository<OfficeTemplate>, 'createQueryBuilder'>
    >;
    let mockCategories: jest.Mocked<
        Pick<Repository<TemplateCategory>, 'createQueryBuilder'>
    >;

    beforeEach(() => {
        mockTemplateQuery = createQueryBuilderMock();
        mockCategoryQuery = createQueryBuilderMock();
        mockTemplates = {
            createQueryBuilder: jest.fn().mockReturnValue(mockTemplateQuery),
        };
        mockCategories = {
            createQueryBuilder: jest.fn().mockReturnValue(mockCategoryQuery),
        };
        target = new TypeOrmDocumentTemplateReaderRepository(
            mockTemplates as unknown as Repository<OfficeTemplate>,
            mockCategories as unknown as Repository<TemplateCategory>,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận false không bị coi như bỏ filter và giá trị search đi vào bind parameter.
    it('should bind catalog filters and return mapped pagination metadata', async () => {
        // Bước 1 - Arrange: query trả một entity ở trang 2 trên tổng cộng 9 mẫu.
        const category = Object.assign(new TemplateCategory(), {
            id: 'category-1',
            name: 'Career',
            slug: 'career',
        });
        const template = Object.assign(new OfficeTemplate(), {
            id: 'template-1',
            slug: 'resume',
            name: 'Resume',
            description: null,
            category,
            isFeatured: false,
            versions: [
                Object.assign(new OfficeTemplateVersion(), {
                    versionNumber: 2,
                    thumbnailFileId: 'preview-1',
                }),
            ],
        });
        mockTemplateQuery.getManyAndCount.mockResolvedValue([[template], 9]);
        const filters = {
            page: 2,
            limit: 8,
            search: 'resume 100%',
            categoryId: 'category-1',
            featured: false,
        };

        // Bước 2 - Act: truy vấn catalog bằng các filter đã validation ở controller.
        const result = await target.list(filters);

        // Bước 3 - Assert: predicate dùng params, false được giữ và skip/take đúng trang.
        expect(result).toEqual({
            items: [
                {
                    id: 'template-1',
                    slug: 'resume',
                    name: 'Resume',
                    description: null,
                    category: {
                        id: 'category-1',
                        name: 'Career',
                        slug: 'career',
                    },
                    isFeatured: false,
                    currentVersion: 2,
                    previewUrl: '/api/document-templates/template-1/preview',
                },
            ],
            total: 9,
            page: 2,
            limit: 8,
            totalPages: 2,
        });
        expect(mockTemplateQuery.andWhere).toHaveBeenCalledWith(
            '(template.name ILIKE :search OR template.description ILIKE :search)',
            { search: '%resume 100%%' },
        );
        expect(mockTemplateQuery.andWhere).toHaveBeenCalledWith(
            'template.categoryId = :categoryId',
            { categoryId: 'category-1' },
        );
        expect(mockTemplateQuery.andWhere).toHaveBeenCalledWith(
            'template.isFeatured = :featured',
            { featured: false },
        );
        expect(mockTemplateQuery.skip).toHaveBeenCalledWith(8);
        expect(mockTemplateQuery.take).toHaveBeenCalledWith(8);
    });

    // Test 2 giữ trang rỗng hợp lệ và xác nhận không chia cho zero hoặc tự tạo trang.
    it('should return zero pages when the catalog query finds no templates', async () => {
        // Bước 1 - Arrange: PostgreSQL không tìm được record nào.
        mockTemplateQuery.getManyAndCount.mockResolvedValue([[], 0]);

        // Bước 2 - Act: đọc trang đầu với limit chuẩn.
        const result = await target.list({ page: 1, limit: 12 });

        // Bước 3 - Assert: kết quả rỗng có metadata đầy đủ.
        expect(result).toEqual({
            items: [],
            total: 0,
            page: 1,
            limit: 12,
            totalPages: 0,
        });
        expect(mockTemplateQuery.andWhere).not.toHaveBeenCalledWith(
            'template.isFeatured = :featured',
            expect.anything(),
        );
    });

    // Test 3 chuyển COUNT dạng string của PostgreSQL sang number cho response contract.
    it('should convert category template counts from strings to numbers', async () => {
        // Bước 1 - Arrange: raw query trả bigint/count theo dạng chuỗi.
        mockCategoryQuery.getRawMany.mockResolvedValue([
            {
                id: 'category-1',
                name: 'Career',
                slug: 'career',
                templateCount: '17',
            },
        ]);

        // Bước 2 - Act: lấy danh sách category.
        const result = await target.listCategories();

        // Bước 3 - Assert: count không còn là string và where giữ category active.
        expect(result).toEqual([
            {
                id: 'category-1',
                name: 'Career',
                slug: 'career',
                templateCount: 17,
            },
        ]);
        expect(mockCategoryQuery.where).toHaveBeenCalledWith(
            'category.isActive = :isActive',
            { isActive: true },
        );
    });

    // Test 4 xác nhận detail chỉ xuất trường public và serialize timestamp nhất quán ISO.
    it('should map published template detail and its current preview URL', async () => {
        // Bước 1 - Arrange: query trả entity cùng category và current version.
        const template = Object.assign(new OfficeTemplate(), {
            id: 'template-1',
            slug: 'resume',
            name: 'Resume',
            description: 'Professional CV',
            category: Object.assign(new TemplateCategory(), {
                id: 'category-1',
                name: 'Career',
                slug: 'career',
            }),
            isFeatured: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            versions: [
                Object.assign(new OfficeTemplateVersion(), {
                    versionNumber: 3,
                    thumbnailFileId: 'preview-1',
                }),
            ],
        });
        mockTemplateQuery.getOne.mockResolvedValue(template);

        // Bước 2 - Act: đọc detail theo UUID.
        const result = await target.findPublishedById('template-1');

        // Bước 3 - Assert: map category, version, preview và ngày ISO đúng contract.
        expect(result).toEqual({
            id: 'template-1',
            slug: 'resume',
            name: 'Resume',
            description: 'Professional CV',
            category: { id: 'category-1', name: 'Career', slug: 'career' },
            isFeatured: true,
            currentVersion: 3,
            previewUrl: '/api/document-templates/template-1/preview',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        });
        expect(mockTemplateQuery.where).toHaveBeenCalledWith(
            'template.id = :id',
            { id: 'template-1' },
        );
    });

    // Test 5 không biến mẫu draft/archive hoặc bị xóa thành response chi tiết.
    it('should return null when a published template query has no row', async () => {
        // Bước 1 - Arrange: điều kiện xuất bản đã lọc hết mẫu.
        mockTemplateQuery.getOne.mockResolvedValue(null);

        // Bước 2 - Act: tìm detail theo id.
        const result = await target.findPublishedById('hidden-template');

        // Bước 3 - Assert: reader trả null để application chuẩn hóa thành not found.
        expect(result).toBeNull();
    });

    // Test 6 xác nhận source và thumbnail đều lấy từ current version đã được query có điều kiện.
    it('should return source and preview references from the current version', async () => {
        // Bước 1 - Arrange: current version có source DOCX và thumbnail riêng.
        const sourceFile = Object.assign(new StoredFile(), {
            provider: 'local',
            storageNamespace: 'document-template-assets',
            objectKey: 'document-templates/resume.docx',
            originalFilename: 'resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'docx-hash',
        });
        const previewFile = Object.assign(new StoredFile(), {
            provider: 'local',
            storageNamespace: 'document-template-assets',
            objectKey: 'document-previews/resume.svg',
            originalFilename: 'resume.svg',
            mimeType: 'image/svg+xml',
            sizeBytes: '128',
            sha256: 'svg-hash',
        });
        const version = Object.assign(new OfficeTemplateVersion(), {
            id: 'version-2',
            templateId: 'template-1',
            versionNumber: 2,
            sourceFile,
            thumbnailFile: previewFile,
            template: Object.assign(new OfficeTemplate(), {
                id: 'template-1',
                name: 'Resume template',
            }),
        });
        mockTemplateQuery.getOne.mockResolvedValue(
            Object.assign(new OfficeTemplate(), { versions: [version] }),
        );

        // Bước 2 - Act: đọc source và preview qua hai method cùng current-version query.
        const source = await target.findCurrentSource('template-1');
        const preview = await target.findCurrentPreview('template-1');

        // Bước 3 - Assert: application nhận metadata files đúng namespace và version.
        expect(source).toEqual({
            templateId: 'template-1',
            templateName: 'Resume template',
            versionId: 'version-2',
            sourceFile: {
                provider: 'local',
                storageNamespace: 'document-template-assets',
                objectKey: 'document-templates/resume.docx',
                originalFilename: 'resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'docx-hash',
            },
        });
        expect(preview).toEqual({
            provider: 'local',
            storageNamespace: 'document-template-assets',
            objectKey: 'document-previews/resume.svg',
            originalFilename: 'resume.svg',
            mimeType: 'image/svg+xml',
            sizeBytes: '128',
            sha256: 'svg-hash',
        });
        expect(mockTemplates.createQueryBuilder).toHaveBeenCalledTimes(2);
    });
});
