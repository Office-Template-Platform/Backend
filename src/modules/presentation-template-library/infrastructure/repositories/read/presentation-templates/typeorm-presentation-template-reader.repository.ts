// TypeORM read adapter cho catalog PPTX; mọi giới hạn public, join và mapping ở infrastructure.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import {
    OfficeTemplateProductType,
    OfficeTemplateStatus,
} from '@/database/enums/office-template.enums';
import type {
    PresentationTemplateReaderContract,
    PresentationTemplateSource,
    PresentationTemplateFilters,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import type {
    PresentationTemplateCategory,
    PresentationTemplateDetail,
    PresentationTemplateSummary,
} from '@/modules/presentation-template-library/application/types/presentation-template-summary';
import { toStoredFileReference } from '@/modules/document-file-storage/infrastructure/mappers/stored-file-reference.mapper';

@Injectable()
// Adapter chỉ đọc dữ liệu; query luôn khóa theo product type, published status và category đang hoạt động.
export class TypeOrmPresentationTemplateReaderRepository implements PresentationTemplateReaderContract {
    constructor(
        @InjectRepository(OfficeTemplate)
        private readonly templates: Repository<OfficeTemplate>,
        @InjectRepository(TemplateCategory)
        private readonly categories: Repository<TemplateCategory>,
    ) {}

    // Trả tất cả mẫu PPTX có thumbnail; search và category luôn được truyền bằng bind parameter.
    async list(
        filters: PresentationTemplateFilters,
    ): Promise<PresentationTemplateSummary[]> {
        const query = this.templates
            .createQueryBuilder('template')
            .innerJoinAndSelect('template.category', 'category')
            .innerJoinAndSelect(
                'template.versions',
                'version',
                'version.isCurrent = :isCurrent',
                { isCurrent: true },
            )
            .innerJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
            .where('template.productType = :productType', {
                productType: OfficeTemplateProductType.PRESENTATION,
            })
            .andWhere('template.status = :status', {
                status: OfficeTemplateStatus.PUBLISHED,
            })
            .andWhere('category.isActive = :categoryActive', {
                categoryActive: true,
            })
            .andWhere('template.deletedAt IS NULL');

        // Trim ở biên query để chuỗi chỉ có khoảng trắng không vô tình biến thành match mọi record.
        const search = filters.search?.trim();

        if (search) {
            query.andWhere(
                '(template.name ILIKE :search OR template.description ILIKE :search)',
                { search: `%${search}%` },
            );
        }

        if (filters.categoryId) {
            query.andWhere('template.categoryId = :categoryId', {
                categoryId: filters.categoryId,
            });
        }

        const templates = await query
            .orderBy('template.isFeatured', 'DESC')
            .addOrderBy('template.publishedAt', 'DESC', 'NULLS LAST')
            .addOrderBy('template.name', 'ASC')
            .getMany();

        return templates.map((template) => this.toSummary(template));
    }

    // Chỉ trả category có ít nhất một mẫu trình chiếu public để filter không dẫn tới danh mục rỗng.
    async listCategories(): Promise<PresentationTemplateCategory[]> {
        const rows = await this.categories
            .createQueryBuilder('category')
            .innerJoin(
                'category.templates',
                'template',
                'template.productType = :productType AND template.status = :status AND template.deletedAt IS NULL',
                {
                    productType: OfficeTemplateProductType.PRESENTATION,
                    status: OfficeTemplateStatus.PUBLISHED,
                },
            )
            .select('category.id', 'id')
            .addSelect('category.name', 'name')
            .addSelect('category.slug', 'slug')
            .addSelect('COUNT(template.id)', 'templateCount')
            .where('category.isActive = :isActive', { isActive: true })
            .groupBy('category.id')
            .orderBy('category.sortOrder', 'ASC')
            .addOrderBy('category.name', 'ASC')
            .getRawMany<{
                id: string;
                name: string;
                slug: string;
                templateCount: string;
            }>();

        return rows.map((category) => ({
            ...category,
            templateCount: Number(category.templateCount),
        }));
    }

    // Trả detail và các ảnh slide đã gắn với đúng version hiện hành của mẫu public.
    async findPublishedById(
        id: string,
    ): Promise<PresentationTemplateDetail | null> {
        const template = await this.basePublishedQuery(id)
            .innerJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
            .leftJoinAndSelect('version.slidePreviews', 'slidePreview')
            .leftJoinAndSelect('slidePreview.previewFile', 'slidePreviewFile')
            .orderBy('slidePreview.slideNumber', 'ASC')
            .getOne();

        if (!template) {
            return null;
        }

        const version = template.versions[0];

        return {
            ...this.toSummary(template),
            slug: template.slug,
            categoryId: template.category.id,
            slides: (version.slidePreviews ?? []).map((slide) => ({
                slideNumber: slide.slideNumber,
                title: slide.title,
                previewUrl: `/api/presentation-templates/${template.id}/slides/${slide.slideNumber}/preview`,
            })),
            createdAt: template.createdAt.toISOString(),
            updatedAt: template.updatedAt.toISOString(),
        };
    }

    // Chỉ resolve thumbnail sau khi catalog query xác nhận mẫu vẫn public.
    async findCurrentPreview(id: string): Promise<StoredFileReference | null> {
        const template = await this.basePublishedQuery(id)
            .innerJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
            .getOne();
        const thumbnail = template?.versions[0]?.thumbnailFile;

        return thumbnail ? toStoredFileReference(thumbnail) : null;
    }

    // Không trả ảnh theo slide number nếu slide không thuộc version hiện hành của một mẫu public.
    async findSlidePreview(
        id: string,
        slideNumber: number,
    ): Promise<StoredFileReference | null> {
        const template = await this.basePublishedQuery(id)
            .innerJoinAndSelect(
                'version.slidePreviews',
                'slidePreview',
                'slidePreview.slideNumber = :slideNumber',
                { slideNumber },
            )
            .innerJoinAndSelect('slidePreview.previewFile', 'previewFile')
            .getOne();
        const preview = template?.versions[0]?.slidePreviews?.[0]?.previewFile;

        return preview ? toStoredFileReference(preview) : null;
    }

    // Lấy source PPTX cùng thông tin snapshot để tạo bản sao độc lập, không cho client biết object key.
    async findCurrentSource(
        id: string,
    ): Promise<PresentationTemplateSource | null> {
        const template = await this.basePublishedQuery(id)
            .innerJoinAndSelect('version.sourceFile', 'sourceFile')
            .getOne();
        const version = template?.versions[0];

        if (!template || !version) {
            return null;
        }

        return {
            templateId: template.id,
            templateName: template.name,
            versionId: version.id,
            sourceFile: toStoredFileReference(version.sourceFile),
        };
    }

    // Dùng chung predicate để list/detail/preview/copy không lệch quy tắc visibility.
    private basePublishedQuery(id: string): SelectQueryBuilder<OfficeTemplate> {
        return this.templates
            .createQueryBuilder('template')
            .innerJoinAndSelect('template.category', 'category')
            .innerJoinAndSelect(
                'template.versions',
                'version',
                'version.isCurrent = :isCurrent',
                { isCurrent: true },
            )
            .where('template.id = :id', { id })
            .andWhere('template.productType = :productType', {
                productType: OfficeTemplateProductType.PRESENTATION,
            })
            .andWhere('template.status = :status', {
                status: OfficeTemplateStatus.PUBLISHED,
            })
            .andWhere('category.isActive = :categoryActive', {
                categoryActive: true,
            })
            .andWhere('template.deletedAt IS NULL');
    }

    // Chỉ xuất field catalog cần thiết; version thiếu slide_count hiển thị 0 để không bịa số slide.
    private toSummary(template: OfficeTemplate): PresentationTemplateSummary {
        const version = template.versions[0];

        return {
            id: template.id,
            name: template.name,
            category: template.category.name,
            description: template.description ?? '',
            previewUrl: `/api/presentation-templates/${template.id}/preview`,
            slideCount: version.slideCount ?? 0,
        };
    }
}
