import {
    Check,
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocumentStatus } from '@/database/enums/office-template.enums';

// Tài liệu người dùng tạo là bản sao file độc lập, giữ liên kết nguồn để truy vết.
@Entity({ name: 'user_documents' })
@Index('idx_user_documents_source_created', [
    'sourceTemplateVersionId',
    'createdAt',
])
@Index('idx_user_documents_status_updated', ['status', 'updatedAt'])
@Check(
    'chk_user_documents_ready_has_file',
    '"status" <> \'ready\' OR "output_file_id" IS NOT NULL',
)
export class UserDocument {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Phiên bản của PPTX gốc, để khớp chính xác bộ slide.
    @Column({ name: 'source_template_version_id', type: 'uuid' })
    sourceTemplateVersionId!: string;

    @ManyToOne(() => OfficeTemplateVersion, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'source_template_version_id',
        referencedColumnName: 'id',
    })
    sourceTemplateVersion!: OfficeTemplateVersion;

    @Column({ type: 'varchar', length: 200 })
    title!: string;

    @Column({
        type: 'enum',
        enum: UserDocumentStatus,
        enumName: 'user_document_status_enum',
        default: UserDocumentStatus.PROVISIONING,
    })
    status!: UserDocumentStatus;

    // File kết xuất cuối cùng, được tạo ra từ PPTX gốc và dữ liệu người dùng.
    @Column({ name: 'output_file_id', type: 'uuid', nullable: true })
    outputFileId!: string | null;

    @ManyToOne(() => StoredFile, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'output_file_id', referencedColumnName: 'id' })
    outputFile!: StoredFile | null;

    // Mã lỗi nếu có thất bại trong quá trình kết xuất.
    @Column({
        name: 'failure_code',
        type: 'varchar',
        length: 80,
        nullable: true,
    })
    failureCode!: string | null;

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
