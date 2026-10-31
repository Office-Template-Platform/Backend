// Seed catalog DOCX/PPTX và metadata file từ assets; PostgreSQL chỉ lưu tham chiếu,
// không nhúng nội dung nhị phân của các file mẫu.
// Seed chỉ quản lý mẫu trong manifest này; mặc định đồng bộ an toàn.
// Cờ --reset chỉ dành cho database local development.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource, In, Not, type EntityManager } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { PresentationSlidePreview } from '@/database/entities/presentation-slide-preview.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import {
    FileStorageProvider,
    OfficeTemplateProductType,
    OfficeTemplateStatus,
} from '@/database/enums/office-template.enums';
import { createDatabaseOptions } from '@/database/config/database.options';

const DOCX_MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PNG_MIME_TYPE = 'image/png';
const WEBP_MIME_TYPE = 'image/webp';

// Metadata của một mẫu catalog; asset được lưu trong database dưới dạng tham chiếu, không nhúng byte.
interface TemplateSeed {
    name: string;
    slug: string;
    description: string;
    categorySlug: string;
    sourceKey: string;
    previewKey: string;
    featured: boolean;
}

// PPTX bổ sung số slide nguồn để catalog không suy ra số slide từ lượng ảnh preview.
interface PresentationTemplateSeed extends TemplateSeed {
    slideCount: number;
}

// Tham chiếu một ảnh preview đã được render sẵn từ đúng slide của file PPTX.
interface PresentationSlidePreviewSeed {
    slideNumber: number;
    title: string;
    previewFileId: string;
}

const categories = [
    { name: 'Bản tin', slug: 'ban-tin', sortOrder: 10 },
    { name: 'Bản ghi nhớ', slug: 'ban-ghi-nho', sortOrder: 20 },
    { name: 'Ứng tuyển', slug: 'ung-tuyen', sortOrder: 30 },
    { name: 'Sự kiện', slug: 'su-kien', sortOrder: 40 },
    { name: 'Báo cáo', slug: 'bao-cao', sortOrder: 50 },
    { name: 'Kinh doanh', slug: 'kinh-doanh', sortOrder: 60 },
    { name: 'Giáo dục', slug: 'giao-duc', sortOrder: 70 },
    { name: 'Chứng nhận', slug: 'chung-nhan', sortOrder: 80 },
    { name: 'Thiết kế sáng tạo', slug: 'thiet-ke-sang-tao', sortOrder: 100 },
    { name: 'Sơ đồ & tổ chức', slug: 'so-do-to-chuc', sortOrder: 110 },
] as const;

const templates = [
    {
        name: 'Báo truyền thống',
        slug: 'bao-truyen-thong',
        description:
            'Bố cục bản tin nhiều cột với tiêu đề, ảnh minh họa và các mục tin.',
        categorySlug: 'ban-tin',
        sourceKey: 'document-templates/Báo truyền thống/file.docx',
        previewKey: 'document-templates/Báo truyền thống/preview.webp',
        featured: true,
    },
    {
        name: 'Bản ghi nhớ có góc cạnh và đường cong',
        slug: 'ban-ghi-nho-goc-canh-duong-cong',
        description:
            'Mẫu ghi nhớ họa tiết hình học, có phần người nhận, người gửi và nội dung.',
        categorySlug: 'ban-ghi-nho',
        sourceKey:
            'document-templates/Bản ghi nhớ có góc cạnh và đường cong/file.docx',
        previewKey:
            'document-templates/Bản ghi nhớ có góc cạnh và đường cong/preview.webp',
        featured: true,
    },
    {
        name: 'Bản ghi nhớ màu xanh lam',
        slug: 'ban-ghi-nho-mau-xanh-lam',
        description:
            'Mẫu ghi nhớ tông xanh lam với bố cục thông tin liên hệ rõ ràng.',
        categorySlug: 'ban-ghi-nho',
        sourceKey: 'document-templates/Bản ghi nhờ màu xanh lam/file.docx',
        previewKey: 'document-templates/Bản ghi nhờ màu xanh lam/preview.webp',
        featured: false,
    },
    {
        name: 'Tiêu đề vui vẻ',
        slug: 'tieu-de-vui-ve',
        description:
            'Mẫu thư với màu sắc vui tươi, phần liên hệ và lời chào có sẵn.',
        categorySlug: 'ung-tuyen',
        sourceKey: 'document-templates/Tiêu đề vui vẻ/file.docx',
        previewKey: 'document-templates/Tiêu đề vui vẻ/preview.webp',
        featured: false,
    },
    {
        name: 'Tờ bướm mời dự tiệc',
        slug: 'to-buom-moi-du-tiec',
        description:
            'Mẫu thư mời nổi bật với thời gian, địa điểm và thông tin phản hồi.',
        categorySlug: 'su-kien',
        sourceKey: 'document-templates/Tờ bướm mời dự tiệc/file.docx',
        previewKey: 'document-templates/Tờ bướm mời dự tiệc/preview.webp',
        featured: true,
    },
    {
        name: 'Báo cáo',
        slug: 'bao-cao',
        description:
            'Mẫu báo cáo có bố cục rõ ràng để trình bày nội dung, số liệu và kết luận.',
        categorySlug: 'bao-cao',
        sourceKey: 'document-templates/Báo cáo/file.docx',
        previewKey: 'document-templates/Báo cáo/preview.webp',
        featured: true,
    },
    {
        name: 'Hóa đơn dịch vụ',
        slug: 'hoa-don-dich-vu',
        description:
            'Mẫu hóa đơn dịch vụ để ghi thông tin khách hàng, hạng mục và tổng thanh toán.',
        categorySlug: 'kinh-doanh',
        sourceKey: 'document-templates/Hóa đơn dịch vụ/file.docx',
        previewKey: 'document-templates/Hóa đơn dịch vụ/preview.webp',
        featured: false,
    },
    {
        name: 'Lịch công tác Hội phụ huynh giáo viên',
        slug: 'lich-cong-tac-hoi-phu-huynh-giao-vien',
        description:
            'Mẫu lịch công tác để phối hợp hoạt động giữa hội phụ huynh và giáo viên.',
        categorySlug: 'giao-duc',
        sourceKey:
            'document-templates/Lịch công tác Hội phụ huynh giáo viên/file.docx',
        previewKey:
            'document-templates/Lịch công tác Hội phụ huynh giáo viên/preview.webp',
        featured: false,
    },
    {
        name: 'Phiếu quà tặng ngày lễ',
        slug: 'phieu-qua-tang-ngay-le',
        description:
            'Mẫu phiếu quà tặng ngày lễ có thể cá nhân hóa cho chương trình tri ân.',
        categorySlug: 'su-kien',
        sourceKey: 'document-templates/Phiếu quà tặng ngày lễ/file.docx',
        previewKey: 'document-templates/Phiếu quà tặng ngày lễ/preview.webp',
        featured: true,
    },
] as const satisfies readonly TemplateSeed[];

// Chỉ đăng ký bộ mẫu có đủ PPTX nguồn và ảnh bìa; thư mục chỉ có preview được giữ ngoài catalog.
export const presentationTemplates = [
    {
        name: 'Bản trình bày phổ biến',
        slug: 'ban-trinh-bay-pho-bien',
        description:
            'Bộ slide đa mục đích với bố cục rõ ràng để giới thiệu ý tưởng, sản phẩm hoặc kế hoạch.',
        categorySlug: 'kinh-doanh',
        sourceKey: 'presentation-templates/Bản trình bày phổ biến/file.pptx',
        previewKey: 'presentation-templates/Bản trình bày phổ biến/preview.png',
        slideCount: 14,
        featured: true,
    },
    {
        name: 'Chứng chỉ đào tạo',
        slug: 'chung-chi-dao-tao',
        description:
            'Mẫu chứng chỉ hoàn thành khóa học hoặc chương trình đào tạo, sẵn sàng cá nhân hóa.',
        categorySlug: 'giao-duc',
        sourceKey: 'presentation-templates/Chứng chỉ đào tạo/file.pptx',
        previewKey: 'presentation-templates/Chứng chỉ đào tạo/preview.png',
        slideCount: 1,
        featured: true,
    },
    {
        name: 'Chứng nhận học bổng',
        slug: 'chung-nhan-hoc-bong',
        description:
            'Mẫu chứng nhận trang trọng để ghi nhận học sinh, sinh viên nhận học bổng.',
        categorySlug: 'giao-duc',
        sourceKey: 'presentation-templates/Chứng nhận học bổng/file.pptx',
        previewKey: 'presentation-templates/Chứng nhận học bổng/preview.png',
        slideCount: 1,
        featured: true,
    },
    {
        name: 'Giải thưởng nhân viên xuất sắc',
        slug: 'giai-thuong-nhan-vien-xuat-sac-wave-border',
        description:
            'Mẫu giải thưởng viền sóng để vinh danh nhân sự có thành tích nổi bật.',
        categorySlug: 'chung-nhan',
        sourceKey:
            'presentation-templates/Giải thưởng nhân viên xuất sắc của Wave border/file.pptx',
        previewKey:
            'presentation-templates/Giải thưởng nhân viên xuất sắc của Wave border/preview.png',
        slideCount: 1,
        featured: false,
    },
    {
        name: 'Giấy chứng nhận nhân viên của tháng',
        slug: 'giay-chung-nhan-nhan-vien-cua-thang',
        description:
            'Mẫu chứng nhận để ghi nhận đóng góp và kết quả làm việc nổi bật trong tháng.',
        categorySlug: 'chung-nhan',
        sourceKey:
            'presentation-templates/Giấy chứng nhận cho nhân viên của tháng/file.pptx',
        previewKey:
            'presentation-templates/Giấy chứng nhận cho nhân viên của tháng/preview.png',
        slideCount: 1,
        featured: false,
    },
    {
        name: 'Sách nhỏ quảng cáo màu vàng',
        slug: 'sach-nho-quang-cao-mau-vang',
        description:
            'Bộ slide quảng cáo tông vàng để giới thiệu sản phẩm, dịch vụ hoặc chiến dịch kinh doanh.',
        categorySlug: 'kinh-doanh',
        sourceKey:
            'presentation-templates/Sách nhỏ quảng cáo màu vàng/file.pptx',
        previewKey:
            'presentation-templates/Sách nhỏ quảng cáo màu vàng/preview.png',
        slideCount: 4,
        featured: true,
    },
    {
        name: 'Thiết kế máy tính bảng',
        slug: 'thiet-ke-may-tinh-bang',
        description:
            'Bộ slide mô phỏng giao diện trên máy tính bảng, phù hợp giới thiệu sản phẩm số và nội dung đào tạo.',
        categorySlug: 'giao-duc',
        sourceKey: 'presentation-templates/Thiết kế Máy tính bảng/file.pptx',
        previewKey: 'presentation-templates/Thiết kế Máy tính bảng/preview.png',
        slideCount: 2,
        featured: false,
    },
    {
        name: 'Sơ đồ tổ chức đơn giản',
        slug: 'so-do-to-chuc-don-gian',
        description:
            'Mẫu sơ đồ trực quan để giới thiệu cơ cấu phòng ban, nhóm hoặc vai trò trong tổ chức.',
        categorySlug: 'so-do-to-chuc',
        sourceKey: 'presentation-templates/Sơ đồ tổ chức đơn giản/file.pptx',
        previewKey: 'presentation-templates/Sơ đồ tổ chức đơn giản/preview.png',
        slideCount: 1,
        featured: false,
    },
    {
        name: 'Thiết kế giọt nước',
        slug: 'thiet-ke-giot-nuoc',
        description:
            'Bộ slide chủ đề giọt nước với nhiều bố cục hình ảnh để trình bày ý tưởng hoặc nội dung sáng tạo.',
        categorySlug: 'thiet-ke-sang-tao',
        sourceKey: 'presentation-templates/Thiết kế giọt nước/file.pptx',
        previewKey: 'presentation-templates/Thiết kế giọt nước/preview.png',
        slideCount: 14,
        featured: true,
    },
] as const satisfies readonly PresentationTemplateSeed[];

// Mẫu lịch không còn asset trong catalog mới; giữ bản ghi ở trạng thái lưu trữ để không làm đứt lịch sử.
const archivedPresentationTemplateSlugs = ['lich-treo-tuong-co-dien'] as const;

const replacedTemplateSlugs = [
    'thu-xin-viec',
    'cv-hien-dai',
    'bien-ban-hop',
    'bao-cao-cong-viec-tuan',
    'de-xuat-du-an',
    'dieu-le-du-an',
    'tong-ket-sau-du-an',
    'huong-dan-hop-tong-ket-du-an',
    'thu-thap-yeu-cau',
    'so-dang-ky-rui-ro',
    'pham-vi-cong-viec',
    'yeu-cau-cung-cap-thong-tin',
] as const;

const replacedCategorySlugs = [
    'cong-viec-van-phong',
    'ke-hoach',
    'kinh-doanh',
    'quan-ly-du-an',
    'lich-ke-hoach',
] as const;

const applicationDataTables = [
    'public."presentation_slide_previews"',
    'public."user_documents"',
    'public."anonymous_workspaces"',
    'public."office_template_versions"',
    'public."office_templates"',
    'public."template_categories"',
    'public."stored_files"',
] as const;

// Chỉ cho phép thao tác xóa dữ liệu khi môi trường và host đều chỉ tới PostgreSQL local.
export function assertLocalResetIsAllowed(
    environment: NodeJS.ProcessEnv,
): void {
    const databaseHost = environment.DB_HOST?.trim().toLowerCase();
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    if (
        environment.NODE_ENV !== 'development' ||
        !databaseHost ||
        !localHosts.has(databaseHost)
    ) {
        throw new Error(
            'Reset database chỉ được phép trong development với DB_HOST là localhost hoặc loopback.',
        );
    }
}

// Xóa cả workspace ẩn danh để trình duyệt test phải tạo workspace mới từ đầu.
// Lệnh chạy trong transaction của seed, giữ nguyên schema và lịch sử migration.
export async function resetApplicationData(
    manager: EntityManager,
): Promise<void> {
    await manager.query(
        `TRUNCATE TABLE ${applicationDataTables.join(', ')} RESTART IDENTITY CASCADE`,
    );
}

// Đọc asset đóng gói, tính checksum và tạo metadata file nếu vị trí đó chưa được đăng ký.
async function ensureStoredFile(
    manager: EntityManager,
    objectKey: string,
    originalFilename: string,
    mimeType: string,
    storageNamespace = 'document-template-assets',
): Promise<StoredFile> {
    const files = manager.getRepository(StoredFile);
    const existing = await files.findOne({
        where: {
            provider: FileStorageProvider.LOCAL,
            storageNamespace,
            objectKey,
        },
    });

    // Hash nội dung hiện tại trước khi đồng bộ để metadata phản ánh đúng asset mà API đang phục vụ.
    const assetPath = resolve(process.cwd(), 'assets', objectKey);
    const content = await readFile(assetPath);
    const metadata = {
        originalFilename,
        mimeType,
        sizeBytes: String(content.byteLength),
        sha256: createHash('sha256').update(content).digest('hex'),
    };

    if (existing) {
        const isMetadataCurrent =
            existing.originalFilename === metadata.originalFilename &&
            existing.mimeType === metadata.mimeType &&
            existing.sizeBytes === metadata.sizeBytes &&
            existing.sha256 === metadata.sha256;

        // Seed chạy lặp không ghi lại hàng file nếu byte và metadata đã đồng bộ.
        return isMetadataCurrent
            ? existing
            : files.save(files.merge(existing, metadata));
    }

    const file = files.create({
        provider: FileStorageProvider.LOCAL,
        storageNamespace,
        objectKey,
        ...metadata,
    });

    return files.save(file);
}

// Tạo hoặc đồng bộ thông tin public của mẫu theo seed; catalog seed luôn được xuất bản và danh mục được kích hoạt.
async function ensureTemplate(
    manager: EntityManager,
    productType: OfficeTemplateProductType,
    templateSeed: TemplateSeed,
    categoryId: string,
): Promise<OfficeTemplate> {
    const repository = manager.getRepository(OfficeTemplate);
    let template = await repository.findOne({
        where: { productType, slug: templateSeed.slug },
        withDeleted: true,
    });
    const now = new Date();

    if (!template) {
        template = repository.create({
            productType,
            categoryId,
            name: templateSeed.name,
            slug: templateSeed.slug,
            description: templateSeed.description,
            status: OfficeTemplateStatus.PUBLISHED,
            isFeatured: templateSeed.featured,
            publishedAt: now,
            deletedAt: null,
        });
    } else {
        // Mẫu seed bị xóa mềm được khôi phục vì asset tương ứng vẫn thuộc catalog đang phát hành.
        if (template.deletedAt) {
            await repository.restore(template.id);
        }

        template = repository.merge(template, {
            categoryId,
            name: templateSeed.name,
            description: templateSeed.description,
            status: OfficeTemplateStatus.PUBLISHED,
            isFeatured: templateSeed.featured,
            publishedAt: template.publishedAt ?? now,
            deletedAt: null,
        });
    }

    return repository.save(template);
}

// Giữ version hiện hành nhưng đồng bộ asset reference và slide count; nếu thiếu current thì tạo số version kế tiếp.
async function ensureCurrentVersion(
    manager: EntityManager,
    templateId: string,
    sourceFile: StoredFile,
    thumbnailFile: StoredFile,
    slideCount: number | null,
    changeNote: string,
): Promise<OfficeTemplateVersion> {
    const repository = manager.getRepository(OfficeTemplateVersion);
    const currentVersion = await repository.findOne({
        where: { templateId, isCurrent: true },
    });

    if (currentVersion) {
        return repository.save(
            repository.merge(currentVersion, {
                sourceFileId: sourceFile.id,
                thumbnailFileId: thumbnailFile.id,
                slideCount,
            }),
        );
    }

    const latestVersion = await repository.findOne({
        where: { templateId },
        order: { versionNumber: 'DESC' },
    });

    return repository.save(
        repository.create({
            templateId,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            sourceFileId: sourceFile.id,
            thumbnailFileId: thumbnailFile.id,
            slideCount,
            isCurrent: true,
            changeNote,
        }),
    );
}

// Tạo object key ổn định cho ảnh slide theo thư mục chứa PPTX nguồn.
// Lấy thư mục từ sourceKey để không khai báo lặp asset path trong manifest.
// Dùng dấu `/` trên mọi OS; ensureStoredFile sẽ báo lỗi nếu asset bị thiếu.
function getPresentationSlidePreviewObjectKey(
    templateSeed: PresentationTemplateSeed,
    slideNumber: number,
): string {
    const directoryEnd = templateSeed.sourceKey.lastIndexOf('/');

    if (directoryEnd < 0) {
        throw new Error(
            `PPTX sourceKey không có thư mục asset: ${templateSeed.sourceKey}`,
        );
    }

    const templateAssetDirectory = templateSeed.sourceKey.slice(
        0,
        directoryEnd,
    );
    const slideFilename = `slide-${String(slideNumber).padStart(3, '0')}.png`;

    return `${templateAssetDirectory}/slides/${slideFilename}`;
}

// Đồng bộ đủ ảnh preview theo số slide của version hiện tại.
// Upsert theo (versionId, slideNumber) để seed chạy lại không tạo bản ghi trùng.
// Xóa metadata preview không còn trong manifest; không xóa file hay hàng stored_files.
async function ensureSlidePreviews(
    manager: EntityManager,
    versionId: string,
    slidePreviews: PresentationSlidePreviewSeed[],
): Promise<void> {
    const repository = manager.getRepository(PresentationSlidePreview);
    const existingPreviews = await repository.find({
        where: { versionId },
    });
    const existingBySlideNumber = new Map(
        existingPreviews.map((preview) => [preview.slideNumber, preview]),
    );
    const expectedSlideNumbers = new Set(
        slidePreviews.map((preview) => preview.slideNumber),
    );

    for (const slidePreview of slidePreviews) {
        const existing = existingBySlideNumber.get(slidePreview.slideNumber);

        if (!existing) {
            await repository.save(
                repository.create({ versionId, ...slidePreview }),
            );
            continue;
        }

        if (
            existing.previewFileId !== slidePreview.previewFileId ||
            existing.title !== slidePreview.title
        ) {
            await repository.save(
                repository.merge(existing, {
                    previewFileId: slidePreview.previewFileId,
                    title: slidePreview.title,
                }),
            );
        }
    }

    const staleSlideNumbers = existingPreviews
        .filter((preview) => !expectedSlideNumbers.has(preview.slideNumber))
        .map((preview) => preview.slideNumber);

    if (staleSlideNumbers.length > 0) {
        await repository.delete({
            versionId,
            slideNumber: In(staleSlideNumbers),
        });
    }
}

// Xóa seed cũ khi chưa phát sinh tài liệu tham chiếu; nếu đã có lịch sử thì ẩn khỏi catalog.
async function removeReplacedTemplates(manager: EntityManager): Promise<void> {
    const templateRepository = manager.getRepository(OfficeTemplate);
    const versionRepository = manager.getRepository(OfficeTemplateVersion);
    const userDocumentRepository = manager.getRepository(UserDocument);
    const slidePreviewRepository = manager.getRepository(
        PresentationSlidePreview,
    );
    const fileRepository = manager.getRepository(StoredFile);
    const categoryRepository = manager.getRepository(TemplateCategory);
    const oldTemplates = await templateRepository.find({
        where: {
            productType: OfficeTemplateProductType.DOCUMENT,
            slug: In([...replacedTemplateSlugs]),
        },
        withDeleted: true,
    });

    for (const oldTemplate of oldTemplates) {
        const versions = await versionRepository.find({
            where: { templateId: oldTemplate.id },
        });
        const versionIds = versions.map((version) => version.id);
        let hasHistoricalReferences = false;

        // Tài liệu đã xóa mềm vẫn giữ khóa ngoại, nên cần tính cả để không làm mất lịch sử.
        if (versionIds.length > 0) {
            const [documentCount, slidePreviewCount] = await Promise.all([
                userDocumentRepository.count({
                    where: { sourceTemplateVersionId: In(versionIds) },
                    withDeleted: true,
                }),
                slidePreviewRepository.count({
                    where: { versionId: In(versionIds) },
                    withDeleted: true,
                }),
            ]);
            hasHistoricalReferences =
                documentCount > 0 || slidePreviewCount > 0;
        }

        // Có tài liệu tham chiếu thì giữ phiên bản để bảo toàn quan hệ lịch sử, chỉ ẩn mẫu cũ.
        if (hasHistoricalReferences) {
            await templateRepository.update(oldTemplate.id, {
                status: OfficeTemplateStatus.ARCHIVED,
                isFeatured: false,
                publishedAt: null,
            });
            continue;
        }

        const oldFileIds = [
            ...new Set(
                versions
                    .flatMap((version) => [
                        version.sourceFileId,
                        version.thumbnailFileId,
                    ])
                    .filter((fileId): fileId is string => fileId !== null),
            ),
        ];

        // Xóa phiên bản trước để tuân thủ khóa ngoại, rồi mới xóa template đã bị thay thế.
        if (versions.length > 0) {
            await versionRepository.delete({ templateId: oldTemplate.id });
        }
        await templateRepository.delete(oldTemplate.id);

        // Chỉ xóa metadata file sau khi xác nhận không còn phiên bản hay tài liệu nào dùng chung.
        for (const fileId of oldFileIds) {
            const [versionReferences, documentReferences, slideReferences] =
                await Promise.all([
                    versionRepository.count({
                        where: [
                            { sourceFileId: fileId },
                            { thumbnailFileId: fileId },
                        ],
                    }),
                    userDocumentRepository.count({
                        where: { outputFileId: fileId },
                        withDeleted: true,
                    }),
                    slidePreviewRepository.count({
                        where: { previewFileId: fileId },
                        withDeleted: true,
                    }),
                ]);

            if (
                versionReferences === 0 &&
                documentReferences === 0 &&
                slideReferences === 0
            ) {
                await fileRepository.delete(fileId);
            }
        }
    }

    // Danh mục demo cũ bị xóa khi không còn template nào giữ khóa ngoại; nếu còn lịch sử thì tắt.
    for (const categorySlug of replacedCategorySlugs) {
        const category = await categoryRepository.findOne({
            where: { slug: categorySlug },
        });
        if (!category) {
            continue;
        }

        const [allTemplateCount, catalogTemplateCount] = await Promise.all([
            templateRepository.count({
                where: { categoryId: category.id },
                withDeleted: true,
            }),
            templateRepository.count({
                where: {
                    categoryId: category.id,
                    status: Not(OfficeTemplateStatus.ARCHIVED),
                },
                withDeleted: true,
            }),
        ]);

        if (allTemplateCount === 0) {
            await categoryRepository.delete(category.id);
        } else if (catalogTemplateCount === 0) {
            // Mẫu lưu trữ còn khóa ngoại nên giữ danh mục để bảo toàn lịch sử dữ liệu.
            await categoryRepository.update(category.id, { isActive: false });
        }
    }
}

// Ẩn mẫu PPTX đã bỏ asset khỏi catalog nhưng giữ version/file reference cho tài liệu cũ.
async function archiveReplacedPresentationTemplates(
    manager: EntityManager,
): Promise<void> {
    const repository = manager.getRepository(OfficeTemplate);
    const oldTemplates = await repository.find({
        where: {
            productType: OfficeTemplateProductType.PRESENTATION,
            slug: In([...archivedPresentationTemplateSlugs]),
        },
        withDeleted: true,
    });

    for (const template of oldTemplates) {
        // Archived mẫu không còn xuất hiện trong catalog nhưng không làm mất liên kết lịch sử.
        await repository.update(template.id, {
            status: OfficeTemplateStatus.ARCHIVED,
            isFeatured: false,
            publishedAt: null,
        });
    }
}

// Nạp mẫu trong một transaction; reset và seed cùng commit để lỗi không để database ở trạng thái rỗng.
async function seedOfficeTemplates(resetRequested: boolean): Promise<void> {
    // Chặn reset trước khi khởi tạo kết nối để không có thao tác xóa trên database ngoài local.
    if (resetRequested) {
        assertLocalResetIsAllowed(process.env);
    }

    const dataSource = new DataSource(createDatabaseOptions());
    await dataSource.initialize();

    try {
        await dataSource.transaction(async (manager) => {
            // Reset chỉ xóa bảng nghiệp vụ; schema và bảng ghi nhận migration vẫn được giữ nguyên.
            if (resetRequested) {
                await resetApplicationData(manager);
            }

            const categoryRepository = manager.getRepository(TemplateCategory);
            const categoriesBySlug = new Map<string, TemplateCategory>();

            // Danh mục được tạo trước vì template có khóa ngoại bắt buộc tới category.
            for (const categorySeed of categories) {
                let category = await categoryRepository.findOne({
                    where: { slug: categorySeed.slug },
                });

                if (!category) {
                    category = categoryRepository.create({
                        ...categorySeed,
                        description: null,
                        isActive: true,
                    });
                    category = await categoryRepository.save(category);
                } else if (
                    category.name !== categorySeed.name ||
                    category.sortOrder !== categorySeed.sortOrder ||
                    !category.isActive
                ) {
                    // Đồng bộ lại danh mục seed để các danh mục mới được dùng ngay cả khi DB từng lưu trạng thái cũ.
                    category = await categoryRepository.save(
                        categoryRepository.merge(category, {
                            ...categorySeed,
                            isActive: true,
                        }),
                    );
                }

                categoriesBySlug.set(category.slug, category);
            }

            for (const templateSeed of templates) {
                const category = categoriesBySlug.get(
                    templateSeed.categorySlug,
                );
                if (!category) {
                    throw new Error(
                        `Seed category is missing: ${templateSeed.categorySlug}`,
                    );
                }

                const template = await ensureTemplate(
                    manager,
                    OfficeTemplateProductType.DOCUMENT,
                    templateSeed,
                    category.id,
                );

                // File rows, template metadata và version được đồng bộ trong cùng transaction.
                const sourceFile = await ensureStoredFile(
                    manager,
                    templateSeed.sourceKey,
                    `${templateSeed.slug}.docx`,
                    DOCX_MIME_TYPE,
                );
                const previewFile = await ensureStoredFile(
                    manager,
                    templateSeed.previewKey,
                    `${templateSeed.slug}.webp`,
                    WEBP_MIME_TYPE,
                );
                await ensureCurrentVersion(
                    manager,
                    template.id,
                    sourceFile,
                    previewFile,
                    null,
                    'Phiên bản mẫu ban đầu.',
                );
            }

            // Seed presentation dùng cùng category, file metadata và version schema với catalog DOCX.
            for (const templateSeed of presentationTemplates) {
                const category = categoriesBySlug.get(
                    templateSeed.categorySlug,
                );
                if (!category) {
                    throw new Error(
                        `Seed category is missing: ${templateSeed.categorySlug}`,
                    );
                }

                const template = await ensureTemplate(
                    manager,
                    OfficeTemplateProductType.PRESENTATION,
                    templateSeed,
                    category.id,
                );

                // Namespace presentation tách khỏi DOCX để storage chỉ cho copy đúng định dạng nguồn.
                const sourceFile = await ensureStoredFile(
                    manager,
                    templateSeed.sourceKey,
                    `${templateSeed.slug}.pptx`,
                    PPTX_MIME_TYPE,
                    'presentation-template-assets',
                );
                const previewFile = await ensureStoredFile(
                    manager,
                    templateSeed.previewKey,
                    `${templateSeed.slug}.png`,
                    PNG_MIME_TYPE,
                    'presentation-template-assets',
                );
                const version = await ensureCurrentVersion(
                    manager,
                    template.id,
                    sourceFile,
                    previewFile,
                    templateSeed.slideCount,
                    'Phiên bản trình chiếu ban đầu.',
                );

                const slidePreviews: PresentationSlidePreviewSeed[] = [];

                // Mỗi slide cần ảnh render riêng. Thiếu asset làm ensureStoredFile ném lỗi,
                // transaction rollback thay vì công bố một catalog thiếu preview.
                for (
                    let slideNumber = 1;
                    slideNumber <= templateSeed.slideCount;
                    slideNumber += 1
                ) {
                    const objectKey = getPresentationSlidePreviewObjectKey(
                        templateSeed,
                        slideNumber,
                    );
                    const slideFile = await ensureStoredFile(
                        manager,
                        objectKey,
                        `${templateSeed.slug}-slide-${String(slideNumber).padStart(3, '0')}.png`,
                        PNG_MIME_TYPE,
                        'presentation-template-assets',
                    );

                    slidePreviews.push({
                        slideNumber,
                        title: `Slide ${slideNumber}`,
                        previewFileId: slideFile.id,
                    });
                }

                // Ghi đủ preview vào cùng transaction với version để API detail luôn khớp slideCount.
                await ensureSlidePreviews(manager, version.id, slidePreviews);
            }

            // Seed thường dọn bản demo cũ; chế độ reset đã xóa sạch nên không cần bước này.
            if (!resetRequested) {
                await archiveReplacedPresentationTemplates(manager);
                await removeReplacedTemplates(manager);
            }
        });

        console.info(
            resetRequested
                ? `Đã reset dữ liệu nghiệp vụ và seed ${templates.length} mẫu DOCX cùng ${presentationTemplates.length} mẫu PPTX.`
                : `Đã đồng bộ ${templates.length} mẫu DOCX cùng ${presentationTemplates.length} mẫu PPTX.`,
        );
    } finally {
        await dataSource.destroy();
    }
}

// Chỉ chạy CLI khi file là entry point; import helper trong Jest không kết nối database.
if (require.main === module) {
    const resetRequested = process.argv.includes('--reset');
    void seedOfficeTemplates(resetRequested).catch((error: unknown) => {
        console.error('Không thể seed dữ liệu thư viện Office.', error);
        process.exitCode = 1;
    });
}
