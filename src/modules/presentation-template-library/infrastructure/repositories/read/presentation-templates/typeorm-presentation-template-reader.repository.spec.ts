// Nhóm unit test cho TypeOrmPresentationTemplateReaderRepository: kiểm tra filter SQL, mapping detail và giới hạn file theo mẫu public.
// | STT | Test case             | Mục đích                              | Các bước làm                               | Kết quả mong đợi                               |
// |-----|-----------------------|---------------------------------------|--------------------------------------------|------------------------------------------------|
// | 1   | List có filter        | Bind search/category và map summary   | Query trả entity; gọi list                 | Filter an toàn, metadata PPTX đúng              |
// | 2   | Search rỗng           | Bỏ điều kiện ILIKE                    | Query trả []; search whitespace; gọi list  | Không bind search rỗng, trả []                  |
// | 3   | Categories            | Đổi COUNT PostgreSQL sang number      | Raw query trả count string                 | templateCount là number                         |
// | 4   | Detail có slide       | Map slides theo version hiện hành     | Query trả template với slide previews      | URL slide đúng thứ tự và slideCount đúng        |
// | 5   | Detail không có       | Ẩn mẫu không public                   | Query trả null                              | Trả null                                        |
// | 6   | Source hiện hành      | Lấy file nguồn để tạo bản sao         | Query trả current version/source file      | Source reference không lộ qua public summary    |
// | 7   | Slide preview         | Lấy đúng file theo slide number        | Query trả slide preview/file                | StoredFileReference được map chính xác          |

import { Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { PresentationSlidePreview } from '@/database/entities/presentation-slide-preview.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { FileStorageProvider } from '@/database/enums/office-template.enums';
import { TypeOrmPresentationTemplateReaderRepository } from '@/modules/presentation-template-library/infrastructure/repositories/read/presentation-templates/typeorm-presentation-template-reader.repository';

describe('TypeOrmPresentationTemplateReaderRepository', () => {
    let target: TypeOrmPresentationTemplateReaderRepository;
    let templates: jest.Mocked<
        Pick<Repository<OfficeTemplate>, 'createQueryBuilder'>
    >;
    let categories: jest.Mocked<
        Pick<Repository<TemplateCategory>, 'createQueryBuilder'>
    >;
    let query: Record<string, jest.Mock>;
    let template: OfficeTemplate;
    let thumbnailFile: StoredFile;
    let sourceFile: StoredFile;

    beforeEach(() => {
        query = {
            innerJoin: jest.fn().mockReturnThis(),
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn(),
            getOne: jest.fn(),
            getRawMany: jest.fn(),
        };
        templates = {
            createQueryBuilder: jest.fn().mockReturnValue(query),
        };
        categories = {
            createQueryBuilder: jest.fn().mockReturnValue(query),
        };
        target = new TypeOrmPresentationTemplateReaderRepository(
            templates as unknown as Repository<OfficeTemplate>,
            categories as unknown as Repository<TemplateCategory>,
        );

        thumbnailFile = Object.assign(new StoredFile(), {
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/preview.webp',
            originalFilename: 'deck.webp',
            mimeType: 'image/webp',
            sizeBytes: '100',
            sha256: 'preview-hash',
        });
        sourceFile = Object.assign(new StoredFile(), {
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'presentation-template-assets',
            objectKey: 'presentation-templates/deck/file.pptx',
            originalFilename: 'deck.pptx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            sizeBytes: '2048',
            sha256: 'source-hash',
        });
        const category = Object.assign(new TemplateCategory(), {
            id: 'category-1',
            name: 'Kinh doanh',
            slug: 'kinh-doanh',
            isActive: true,
        });
        const version = Object.assign(new OfficeTemplateVersion(), {
            id: 'version-1',
            versionNumber: 2,
            slideCount: 14,
            isCurrent: true,
            thumbnailFileId: 'thumbnail-1',
            thumbnailFile,
            slidePreviews: [],
            sourceFile,
        });
        template = Object.assign(new OfficeTemplate(), {
            id: 'template-1',
            slug: 'deck',
            name: 'Presentation deck',
            description: null,
            category,
            categoryId: category.id,
            isFeatured: true,
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            updatedAt: new Date('2026-10-02T00:00:00.000Z'),
            versions: [version],
        });
    });

    afterEach(() => jest.clearAllMocks());

    // Test 1 xác nhận predicate và bind parameter của list tách biệt khỏi product type khác.
    it('should bind search/category filters and map a presentation summary', async () => {
        // Bước 1 - Arrange: query builder trả một entity thuộc catalog PPTX.
        query.getMany.mockResolvedValue([template]);

        // Bước 2 - Act: lọc theo search và UUID category.
        const result = await target.list({
            search: '  deck  ',
            categoryId: 'category-1',
        });

        // Bước 3 - Assert: search đã trim, filter bind an toàn và summary không lộ object key.
        expect(query.andWhere).toHaveBeenCalledWith(
            '(template.name ILIKE :search OR template.description ILIKE :search)',
            { search: '%deck%' },
        );
        expect(query.andWhere).toHaveBeenCalledWith(
            'template.categoryId = :categoryId',
            { categoryId: 'category-1' },
        );
        expect(result).toEqual([
            {
                id: 'template-1',
                name: 'Presentation deck',
                category: 'Kinh doanh',
                description: '',
                previewUrl: '/api/presentation-templates/template-1/preview',
                slideCount: 14,
            },
        ]);
        expect(JSON.stringify(result)).not.toContain(thumbnailFile.objectKey);
    });

    // Test 2 không thêm điều kiện LIKE cho search whitespace và giữ trang kết quả rỗng.
    it('should omit an empty search filter and return no matches', async () => {
        // Bước 1 - Arrange: kết quả database rỗng và filter search chỉ chứa khoảng trắng.
        query.getMany.mockResolvedValue([]);

        // Bước 2 - Act: gọi list không có term search thực.
        const result = await target.list({ search: '   ' });

        // Bước 3 - Assert: không sinh LIKE %% và trả mảng rỗng.
        expect(query.andWhere).not.toHaveBeenCalledWith(
            expect.stringContaining('ILIKE'),
            expect.anything(),
        );
        expect(result).toEqual([]);
    });

    // Test 3 chuyển COUNT(*) dạng string của PostgreSQL sang number cho contract HTTP.
    it('should map category counts from PostgreSQL strings to numbers', async () => {
        // Bước 1 - Arrange: raw query trả count theo kiểu string.
        query.getRawMany.mockResolvedValue([
            {
                id: 'category-1',
                name: 'Kinh doanh',
                slug: 'kinh-doanh',
                templateCount: '6',
            },
        ]);

        // Bước 2 - Act: lấy danh sách category có presentation public.
        const result = await target.listCategories();

        // Bước 3 - Assert: count là number và query gắn product type PRESENTATION.
        expect(query.innerJoin).toHaveBeenCalledWith(
            'category.templates',
            'template',
            expect.stringContaining('template.productType'),
            expect.objectContaining({ productType: 'presentation' }),
        );
        expect(result[0]?.templateCount).toBe(6);
        expect(typeof result[0]?.templateCount).toBe('number');
    });

    // Test 4 detail gắn slide URL với đúng template/slide number và dùng slide_count của version.
    it('should map a published detail and slide previews', async () => {
        // Bước 1 - Arrange: entity có một slide preview thuộc current version.
        const previewFile = Object.assign(new StoredFile(), {
            ...thumbnailFile,
            objectKey: 'presentation-templates/deck/slides/1.webp',
        });
        const slide = Object.assign(new PresentationSlidePreview(), {
            slideNumber: 1,
            title: 'Bìa',
            previewFile,
        });
        template.versions[0].slidePreviews = [slide];
        query.getOne.mockResolvedValue(template);

        // Bước 2 - Act: lấy detail của bộ mẫu.
        const result = await target.findPublishedById('template-1');

        // Bước 3 - Assert: slide preview và số slide thật được map chính xác.
        expect(result).toMatchObject({
            id: 'template-1',
            slug: 'deck',
            categoryId: 'category-1',
            slideCount: 14,
            slides: [
                {
                    slideNumber: 1,
                    title: 'Bìa',
                    previewUrl:
                        '/api/presentation-templates/template-1/slides/1/preview',
                },
            ],
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
        });
    });

    // Test 5 dùng null cho mẫu không public/đã xóa thay vì phân biệt trạng thái nội bộ.
    it('should return null when no published template matches', async () => {
        // Bước 1 - Arrange: current version query không tìm thấy template.
        query.getOne.mockResolvedValue(null);

        // Bước 2 - Act: truy vấn detail theo UUID.
        const result = await target.findPublishedById('hidden-template');

        // Bước 3 - Assert: repository trả null cho application ánh xạ thành 404.
        expect(result).toBeNull();
    });

    // Test 6 map source file nội bộ để use case copy đúng version đang public.
    it('should return the current source file for an eligible template', async () => {
        // Bước 1 - Arrange: current version có source file local.
        query.getOne.mockResolvedValue(template);

        // Bước 2 - Act: reader lấy source để khởi tạo bản sao.
        const result = await target.findCurrentSource('template-1');

        // Bước 3 - Assert: version/source được giữ đúng trong internal contract.
        expect(result).toEqual({
            templateId: 'template-1',
            templateName: 'Presentation deck',
            versionId: 'version-1',
            sourceFile: {
                provider: 'local',
                storageNamespace: 'presentation-template-assets',
                objectKey: 'presentation-templates/deck/file.pptx',
                originalFilename: 'deck.pptx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                sizeBytes: '2048',
                sha256: 'source-hash',
            },
        });
    });

    // Test 7 xác nhận slide number được bind vào join và chỉ trả file ảnh đã đăng ký.
    it('should return the preview file for the requested slide', async () => {
        // Bước 1 - Arrange: version có slide preview và file reference tương ứng.
        const previewFile = Object.assign(new StoredFile(), {
            ...thumbnailFile,
            objectKey: 'presentation-templates/deck/slides/3.webp',
        });
        const slide = Object.assign(new PresentationSlidePreview(), {
            slideNumber: 3,
            previewFile,
        });
        template.versions[0].slidePreviews = [slide];
        query.getOne.mockResolvedValue(template);

        // Bước 2 - Act: yêu cầu preview slide 3.
        const result = await target.findSlidePreview('template-1', 3);

        // Bước 3 - Assert: join lọc đúng số slide và trả metadata ảnh.
        expect(query.innerJoinAndSelect).toHaveBeenCalledWith(
            'version.slidePreviews',
            'slidePreview',
            'slidePreview.slideNumber = :slideNumber',
            { slideNumber: 3 },
        );
        expect(result?.objectKey).toBe(
            'presentation-templates/deck/slides/3.webp',
        );
    });
});
