// TypeORM adapter lưu workspace ẩn danh và chỉ tra cứu token chưa hết hạn.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AnonymousWorkspace } from '@/database/entities/anonymous-workspace.entity';
import type {
    AnonymousWorkspaceRepositoryContract,
    NewAnonymousWorkspace,
} from '@/modules/user-document-management/application/contracts/anonymous-workspace-repository.contract';

@Injectable()
// Adapter giữ truy vấn và cột persistence ngoài application service.
export class TypeOrmAnonymousWorkspaceRepository implements AnonymousWorkspaceRepositoryContract {
    constructor(
        @InjectRepository(AnonymousWorkspace)
        private readonly workspaces: Repository<AnonymousWorkspace>,
    ) {}

    // Lưu hash cùng thời hạn hiệu lực rồi chỉ trả ID nội bộ cho application.
    async create(input: NewAnonymousWorkspace): Promise<string> {
        const workspace = this.workspaces.create(input);
        const savedWorkspace = await this.workspaces.save(workspace);

        return savedWorkspace.id;
    }

    // Chỉ chấp nhận token còn hạn; token hết hạn được service thay bằng workspace mới.
    async findActiveIdByTokenHash(
        tokenHash: string,
        now: Date,
    ): Promise<string | null> {
        const workspace = await this.workspaces.findOne({
            select: { id: true },
            where: { tokenHash, expiresAt: MoreThan(now) },
        });

        return workspace?.id ?? null;
    }

    // Ghi nhận hoạt động và gia hạn hạn dùng cùng lúc để DB không hết hạn trước cookie đã làm mới.
    async updateActivity(
        id: string,
        lastSeenAt: Date,
        expiresAt: Date,
    ): Promise<void> {
        await this.workspaces.update(id, { lastSeenAt, expiresAt });
    }
}
