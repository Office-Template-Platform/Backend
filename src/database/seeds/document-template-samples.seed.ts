// Seed bộ mẫu DOCX vào PostgreSQL, thuộc lớp database và được gọi bằng script CLI.
// Mặc định chỉ thêm dữ liệu còn thiếu; cờ --reset chỉ chạy ở development trên host local.
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
const WEBP_MIME_TYPE = 'image/webp';

const categories = [
    { name: 'Bản tin', slug: 'ban-tin', sortOrder: 10 },
    { name: 'Bản ghi nhớ', slug: 'ban-ghi-nho', sortOrder: 20 },
    { name: 'Ứng tuyển', slug: 'ung-tuyen', sortOrder: 30 },
    { name: 'Sự kiện', slug: 'su-kien', sortOrder: 40 },
    { name: 'Báo cáo', slug: 'bao-cao', sortOrder: 50 },
    { name: 'Kinh doanh', slug: 'kinh-doanh', sortOrder: 60 },
    { name: 'Giáo dục', slug: 'giao-duc', sortOrder: 70 },
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
] as const;

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
] as const;

const applicationDataTables = [
    'public."presentation_slide_previews"',
    'public."user_documents"',
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

// Xóa các bảng nghiệp vụ trong transaction nhưng giữ schema và lịch sử migration.
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
): Promise<StoredFile> {
    const files = manager.getRepository(StoredFile);
    const existing = await files.findOne({
        where: {
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'document-template-assets',
            objectKey,
        },
    });

    if (existing) {
        return existing;
    }

    const assetPath = resolve(process.cwd(), 'assets', objectKey);
    const content = await readFile(assetPath);
    const file = files.create({
        provider: FileStorageProvider.LOCAL,
        storageNamespace: 'document-template-assets',
        objectKey,
        originalFilename,
        mimeType,
        sizeBytes: String(content.byteLength),
        sha256: createHash('sha256').update(content).digest('hex'),
    });

    return files.save(file);
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

// Nạp mẫu trong một transaction; reset và seed cùng commit để lỗi không để database ở trạng thái rỗng.
async function seedDocumentTemplates(resetRequested: boolean): Promise<void> {
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

            const templateRepository = manager.getRepository(OfficeTemplate);
            const versionRepository = manager.getRepository(
                OfficeTemplateVersion,
            );

            for (const templateSeed of templates) {
                let template = await templateRepository.findOne({
                    where: {
                        productType: OfficeTemplateProductType.DOCUMENT,
                        slug: templateSeed.slug,
                    },
                });

                if (template) {
                    const currentVersion = await versionRepository.findOne({
                        where: { templateId: template.id, isCurrent: true },
                    });
                    if (currentVersion) {
                        continue;
                    }
                } else {
                    const category = categoriesBySlug.get(
                        templateSeed.categorySlug,
                    );
                    if (!category) {
                        throw new Error(
                            `Seed category is missing: ${templateSeed.categorySlug}`,
                        );
                    }

                    template = await templateRepository.save(
                        templateRepository.create({
                            productType: OfficeTemplateProductType.DOCUMENT,
                            categoryId: category.id,
                            name: templateSeed.name,
                            slug: templateSeed.slug,
                            description: templateSeed.description,
                            status: OfficeTemplateStatus.PUBLISHED,
                            isFeatured: templateSeed.featured,
                            publishedAt: new Date(),
                        }),
                    );
                }

                // File rows và phiên bản được commit cùng transaction với template metadata.
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
                await versionRepository.save(
                    versionRepository.create({
                        templateId: template.id,
                        versionNumber: 1,
                        sourceFileId: sourceFile.id,
                        thumbnailFileId: previewFile.id,
                        isCurrent: true,
                        changeNote: 'Phiên bản mẫu ban đầu.',
                    }),
                );
            }

            // Seed thường dọn bản demo cũ; chế độ reset đã xóa sạch nên không cần bước này.
            if (!resetRequested) {
                await removeReplacedTemplates(manager);
            }
        });

        console.info(
            resetRequested
                ? `Đã reset dữ liệu nghiệp vụ và seed ${templates.length} mẫu DOCX.`
                : `Đã xác nhận ${templates.length} mẫu DOCX mới.`,
        );
    } finally {
        await dataSource.destroy();
    }
}

// Chỉ chạy CLI khi file là entry point; import helper trong Jest không kết nối database.
if (require.main === module) {
    const resetRequested = process.argv.includes('--reset');
    void seedDocumentTemplates(resetRequested).catch((error: unknown) => {
        console.error('Không thể seed dữ liệu thư viện mẫu DOCX.', error);
        process.exitCode = 1;
    });
}
