import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';

// Ảnh xem trước theo thứ tự slide, gắn với phiên bản để khớp chính xác bộ PPTX.
@Entity({ name: 'presentation_slide_previews' })
@Index(
    'uq_presentation_slide_previews_position',
    ['versionId', 'slideNumber'],
    {
        unique: true,
    },
)
@Index('idx_presentation_slide_previews_file', ['previewFileId'])
@Check('chk_presentation_slide_previews_number_positive', '"slide_number" > 0')
export class PresentationSlidePreview {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Phiên bản của PPTX gốc, để khớp chính xác bộ slide.
    @Column({ name: 'version_id', type: 'uuid' })
    versionId!: string;

    @ManyToOne(
        () => OfficeTemplateVersion,
        (version) => version.slidePreviews,
        {
            nullable: false,
            onDelete: 'RESTRICT',
        },
    )
    @JoinColumn({ name: 'version_id', referencedColumnName: 'id' })
    version!: OfficeTemplateVersion;

    @Column({ name: 'slide_number', type: 'integer' })
    slideNumber!: number;

    // File xem trước của slide, được tạo ra từ PPTX gốc.
    @Column({ name: 'preview_file_id', type: 'uuid' })
    previewFileId!: string;

    @ManyToOne(() => StoredFile, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'preview_file_id', referencedColumnName: 'id' })
    previewFile!: StoredFile;

    @Column({ type: 'varchar', length: 200, nullable: true })
    title!: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;
}
