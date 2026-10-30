import {
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Column,
} from 'typeorm';

// Lưu danh tính ẩn danh của một hồ sơ trình duyệt; chỉ token đã băm được ghi vào PostgreSQL.
@Entity({ name: 'anonymous_workspaces' })
@Index('uq_anonymous_workspaces_token_hash', ['tokenHash'], { unique: true })
@Index('idx_anonymous_workspaces_expires_at', ['expiresAt'])
export class AnonymousWorkspace {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'token_hash', type: 'varchar', length: 64 })
    tokenHash!: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;

    @Column({ name: 'last_seen_at', type: 'timestamptz' })
    lastSeenAt!: Date;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt!: Date;
}
