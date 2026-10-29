import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';

// Danh mục phân loại mẫu; danh mục có thể được dùng cho cả văn bản và trình chiếu.
@Entity({ name: 'template_categories' })
@Index('uq_template_categories_slug', ['slug'], { unique: true })
@Index('idx_template_categories_active_order', ['isActive', 'sortOrder'])
export class TemplateCategory {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 120 })
    name!: string;

    @Column({ type: 'varchar', length: 140 })
    slug!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder!: number;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;

    @OneToMany(() => OfficeTemplate, (template) => template.category)
    templates!: OfficeTemplate[];

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt!: Date;
}
