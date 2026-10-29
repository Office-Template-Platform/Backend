import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    JoinColumn,
    UpdateDateColumn,
} from 'typeorm';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import {
    OfficeTemplateProductType,
    OfficeTemplateStatus,
} from '@/database/enums/office-template.enums';

// Danh mục gốc dùng chung cho hai sản phẩm; nội dung file bất biến thuộc từng phiên bản.
@Entity({ name: 'office_templates' })
@Index('uq_office_templates_live_slug', ['productType', 'slug'], {
    unique: true,
    where: '"deleted_at" IS NULL',
})
@Index('idx_office_templates_catalog', ['productType', 'status', 'categoryId'])
@Index('idx_office_templates_featured', [
    'productType',
    'isFeatured',
    'publishedAt',
])
export class OfficeTemplate {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({
        name: 'product_type',
        type: 'enum',
        enum: OfficeTemplateProductType,
        enumName: 'office_template_product_type_enum',
    })
    productType!: OfficeTemplateProductType;

    // Danh mục của mẫu
    @Column({ name: 'category_id', type: 'uuid' })
    categoryId!: string;

    @ManyToOne(() => TemplateCategory, (category) => category.templates, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'category_id', referencedColumnName: 'id' })
    category!: TemplateCategory;

    @Column({ type: 'varchar', length: 200 })
    name!: string;

    @Column({ type: 'varchar', length: 220 })
    slug!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({
        type: 'enum',
        enum: OfficeTemplateStatus,
        enumName: 'office_template_status_enum',
        default: OfficeTemplateStatus.DRAFT,
    })
    status!: OfficeTemplateStatus;

    @Column({ name: 'is_featured', type: 'boolean', default: false })
    isFeatured!: boolean;

    @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
    publishedAt!: Date | null;

    @OneToMany(() => OfficeTemplateVersion, (version) => version.template)
    versions!: OfficeTemplateVersion[];

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt!: Date;

    @DeleteDateColumn({
        name: 'deleted_at',
        type: 'timestamptz',
        nullable: true,
    })
    deletedAt!: Date | null;
}
