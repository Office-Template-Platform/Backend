import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { PresentationSlidePreview } from '@/database/entities/presentation-slide-preview.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';

// Phiên bản bất biến của file mẫu; tài liệu mới ghim vào phiên bản đã chọn để tái lập nguồn.
@Entity({ name: 'office_template_versions' })
@Index('uq_office_template_versions_number', ['templateId', 'versionNumber'], {
    unique: true,
})
@Index('uq_office_template_versions_current', ['templateId'], {
    unique: true,
    where: '"is_current" = true',
})
@Index('idx_office_template_versions_source_file', ['sourceFileId'])
@Check('chk_office_template_versions_number_positive', '"version_number" > 0')
export class OfficeTemplateVersion {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Mẫu gốc của phiên bản
    @Column({ name: 'template_id', type: 'uuid' })
    templateId!: string;

    @ManyToOne(() => OfficeTemplate, (template) => template.versions, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'template_id', referencedColumnName: 'id' })
    template!: OfficeTemplate;

    @Column({ name: 'version_number', type: 'integer' })
    versionNumber!: number;

    // File nguồn bất biến của phiên bản
    @Column({ name: 'source_file_id', type: 'uuid' })
    sourceFileId!: string;

    @ManyToOne(() => StoredFile, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'source_file_id', referencedColumnName: 'id' })
    sourceFile!: StoredFile;

    @Column({ name: 'thumbnail_file_id', type: 'uuid', nullable: true })
    thumbnailFileId!: string | null;

    // File thumbnail của phiên bản
    @ManyToOne(() => StoredFile, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'thumbnail_file_id', referencedColumnName: 'id' })
    thumbnailFile!: StoredFile | null;

    // Đánh dấu phiên bản hiện hành. Chỉ một phiên bản của mỗi mẫu được đánh dấu hiện hành.
    @Column({ name: 'is_current', type: 'boolean', default: false })
    isCurrent!: boolean;

    // Ghi chú thay đổi của phiên bản
    @Column({ name: 'change_note', type: 'text', nullable: true })
    changeNote!: string | null;

    @OneToMany(() => PresentationSlidePreview, (preview) => preview.version)
    slidePreviews!: PresentationSlidePreview[];

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;
}
