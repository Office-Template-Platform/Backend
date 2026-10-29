import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { FileStorageProvider } from '@/database/enums/office-template.enums';

// Tham chiếu file ngoài PostgreSQL; nội dung nhị phân được quản lý bởi storage adapter.
@Entity({ name: 'stored_files' })
@Index(
    'uq_stored_files_location',
    ['provider', 'storageNamespace', 'objectKey'],
    { unique: true },
)
@Index('idx_stored_files_sha256', ['sha256'])
@Check('chk_stored_files_size_nonnegative', '"size_bytes" >= 0')
export class StoredFile {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({
        type: 'enum',
        enum: FileStorageProvider,
        enumName: 'file_storage_provider_enum',
    })
    provider!: FileStorageProvider;

    // Namespace là bucket/container hoặc vùng lưu cục bộ để khóa định danh luôn đầy đủ.
    // Mục đích là để tránh xung đột khi lưu trữ nhiều loại file khác nhau trong cùng một storage.
    // Ví dụ: "local" có thể là "local/uploads" hoặc "local/previews", còn S3 có thể là "s3/my-bucket-name".
    @Column({ name: 'storage_namespace', type: 'varchar', length: 120 })
    storageNamespace!: string;

    // Khóa/đường dẫn file trong vùng lưu.
    @Column({ name: 'object_key', type: 'text' })
    objectKey!: string;

    // Tên file gốc khi upload, có thể null nếu file được tạo ra từ hệ thống.
    @Column({
        name: 'original_filename',
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    originalFilename!: string | null;

    // MIME type của file, ví dụ: "application/pdf", "image/png", "text/plain".
    @Column({ name: 'mime_type', type: 'varchar', length: 160 })
    mimeType!: string;

    // PostgreSQL bigint được TypeORM trả về dạng string để không mất độ chính xác.
    @Column({ name: 'size_bytes', type: 'bigint' })
    sizeBytes!: string;

    // Mã băm SHA256 của file, dùng để xác thực và tránh trùng lặp.
    @Column({ name: 'sha256', type: 'char', length: 64, nullable: true })
    sha256!: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;
}
