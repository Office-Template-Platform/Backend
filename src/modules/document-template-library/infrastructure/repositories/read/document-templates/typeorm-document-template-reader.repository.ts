// TypeORM read adapter cho catalog mẫu DOCX, danh mục, phiên bản hiện hành và file nguồn.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import {
    OfficeTemplateProductType,
    OfficeTemplateStatus,
} from '@/database/enums/office-template.enums';
import type {
    DocumentTemplateCategory,
    DocumentTemplateDetail,
    DocumentTemplateFilters,
    DocumentTemplateListItem,
    DocumentTemplateReaderContract,
    DocumentTemplateSource,
    PagedDocumentTemplates,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { toStoredFileReference } from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';

@Injectable()
// Adapter giữ mọi truy vấn, join, sort và pagination của catalog trong PostgreSQL.
export class TypeOrmDocumentTemplateReaderRepository implements DocumentTemplateReaderContract {
    // Chỉ nhận repositories cần đọc; ghi user document thuộc adapter riêng.
    constructor(
        @InjectRepository(OfficeTemplate)
        private readonly templates: Repository<OfficeTemplate>,
        @InjectRepository(TemplateCategory)
        private readonly categories: Repository<TemplateCategory>,
    ) {}

    // Áp filter bằng bind parameters, chỉ trả mẫu published còn active và có current version.
    async list(
        filters: DocumentTemplateFilters,
    ): Promise<PagedDocumentTemplates> {
        const query = this.templates
            .createQueryBuilder('template')
            .innerJoinAndSelect('template.category', 'category')
            .innerJoinAndSelect(
                'template.versions',
                'version',
                'version.isCurrent = :isCurrent',
                { isCurrent: true },
            )
            .leftJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
            .where('template.productType = :productType', {
                productType: OfficeTemplateProductType.DOCUMENT,
            })
            .andWhere('template.status = :status', {
                status: OfficeTemplateStatus.PUBLISHED,
            })
            .andWhere('category.isActive = :categoryActive', {
                categoryActive: true,
            })
            .andWhere('template.deletedAt IS NULL');

        // Search được bind thay vì ghép SQL để giữ dữ liệu người dùng ngoài cú pháp query.
        if (filters.search) {
            query.andWhere(
                '(template.name ILIKE :search OR template.description ILIKE :search)',
                { search: `%${filters.search}%` },
            );
        }

        // Chỉ thêm category predicate khi filter có giá trị đã qua UUID validation.
        if (filters.categoryId) {
            query.andWhere('template.categoryId = :categoryId', {
                categoryId: filters.categoryId,
            });
        }

        // undefined nghĩa là bỏ lọc; false là một filter hợp lệ cần được giữ nguyên.
        if (filters.featured !== undefined) {
            query.andWhere('template.isFeatured = :featured', {
                featured: filters.featured,
            });
        }

        query
            .orderBy('template.isFeatured', 'DESC')
            .addOrderBy('template.publishedAt', 'DESC', 'NULLS LAST')
            .addOrderBy('template.name', 'ASC')
            .skip((filters.page - 1) * filters.limit)
            .take(filters.limit);

        const [templates, total] = await query.getManyAndCount();

        return {
            items: templates.map((template) => this.toListItem(template)),
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    // Chỉ trả danh mục active và đếm mẫu DOCX published chưa bị soft-delete.
    async listCategories(): Promise<DocumentTemplateCategory[]> {
        const rows = await this.categories
            .createQueryBuilder('category')
            .leftJoin(
                'category.templates',
                'template',
                'template.productType = :productType AND template.status = :status AND template.deletedAt IS NULL',
                {
                    productType: OfficeTemplateProductType.DOCUMENT,
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

    // Trả chi tiết cho mẫu public; các trạng thái khác được coi như không tìm thấy.
    async findPublishedById(
        id: string,
    ): Promise<DocumentTemplateDetail | null> {
        const template = await this.templates
            .createQueryBuilder('template')
            .innerJoinAndSelect('template.category', 'category')
            .innerJoinAndSelect(
                'template.versions',
                'version',
                'version.isCurrent = :isCurrent',
                { isCurrent: true },
            )
            .leftJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
            .where('template.id = :id', { id })
            .andWhere('template.productType = :productType', {
                productType: OfficeTemplateProductType.DOCUMENT,
            })
            .andWhere('template.status = :status', {
                status: OfficeTemplateStatus.PUBLISHED,
            })
            .andWhere('category.isActive = :categoryActive', {
                categoryActive: true,
            })
            .andWhere('template.deletedAt IS NULL')
            .getOne();

        if (!template) {
            return null;
        }

        return {
            ...this.toListItem(template),
            createdAt: template.createdAt.toISOString(),
            updatedAt: template.updatedAt.toISOString(),
        };
    }

    // Trả reference ảnh hiện hành; null để application ánh xạ thành lỗi preview 404.
    async findCurrentPreview(id: string): Promise<StoredFileReference | null> {
        const version = await this.findCurrentVersion(id);

        return version?.thumbnailFile
            ? toStoredFileReference(version.thumbnailFile)
            : null;
    }

    // Ghim source file vào current version đã xác minh public trước khi tạo document record.
    async findCurrentSource(
        id: string,
    ): Promise<DocumentTemplateSource | null> {
        const version = await this.findCurrentVersion(id);

        if (!version) {
            return null;
        }

        return {
            templateId: version.template.id,
            templateName: version.template.name,
            versionId: version.id,
            sourceFile: toStoredFileReference(version.sourceFile),
        };
    }

    // Chỉ query một phiên bản hiện hành của mẫu DOCX published còn active.
    private findCurrentVersion(
        id: string,
    ): Promise<OfficeTemplateVersion | null> {
        return (
            this.templates
                .createQueryBuilder('template')
                .innerJoinAndSelect('template.category', 'category')
                .innerJoinAndSelect(
                    'template.versions',
                    'version',
                    'version.isCurrent = :isCurrent',
                    { isCurrent: true },
                )
                // Load ngược template trên version vì findCurrentSource đọc id và tên từ quan hệ này.
                .innerJoinAndSelect('version.template', 'sourceTemplate')
                .innerJoinAndSelect('version.sourceFile', 'sourceFile')
                .leftJoinAndSelect('version.thumbnailFile', 'thumbnailFile')
                .where('template.id = :id', { id })
                .andWhere('template.productType = :productType', {
                    productType: OfficeTemplateProductType.DOCUMENT,
                })
                .andWhere('template.status = :status', {
                    status: OfficeTemplateStatus.PUBLISHED,
                })
                .andWhere('category.isActive = :categoryActive', {
                    categoryActive: true,
                })
                .andWhere('template.deletedAt IS NULL')
                .getOne()
                .then((template) => template?.versions[0] ?? null)
        );
    }

    // Chỉ map các trường catalog được công khai; database entity không rời infrastructure.
    private toListItem(template: OfficeTemplate): DocumentTemplateListItem {
        const version = template.versions[0];

        return {
            id: template.id,
            slug: template.slug,
            name: template.name,
            description: template.description,
            category: {
                id: template.category.id,
                name: template.category.name,
                slug: template.category.slug,
            },
            isFeatured: template.isFeatured,
            currentVersion: version.versionNumber,
            previewUrl: version.thumbnailFileId
                ? `/api/document-templates/${template.id}/preview`
                : null,
        };
    }
}
