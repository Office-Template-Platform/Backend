// TypeORM read adapter cho tài liệu người dùng và các quan hệ snapshot cần cho metadata.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
    UserDocumentListQuery,
} from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { toUserDocumentRecord } from '@/modules/user-document-management/infrastructure/repositories/mappers/user-document-record.mapper';

@Injectable()
// Adapter chỉ đọc user document; query và entity mapping không lọt vào application service.
export class TypeOrmUserDocumentReaderRepository implements UserDocumentReaderContract {
    // Repository nạp output file và template-version snapshot trong một lần đọc.
    constructor(
        @InjectRepository(UserDocument)
        private readonly userDocuments: Repository<UserDocument>,
    ) {}

    // Trả null khi id không tồn tại để application quyết định lỗi domain/HTTP.
    async findUserDocumentById(id: string): Promise<UserDocumentRecord | null> {
        const document = await this.userDocuments.findOne({
            where: { id },
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });

        return document ? toUserDocumentRecord(document) : null;
    }

    // Claim tài liệu cũ chỉ khi còn chưa có owner; điều kiện UPDATE nguyên tử chặn hai workspace nhận cùng file.
    async findUserDocumentByIdForWorkspace(
        id: string,
        workspaceId: string,
    ): Promise<UserDocumentRecord | null> {
        await this.userDocuments
            .createQueryBuilder()
            .update(UserDocument)
            .set({ anonymousWorkspaceId: workspaceId })
            .where('id = :id', { id })
            .andWhere('anonymous_workspace_id IS NULL')
            .andWhere('deleted_at IS NULL')
            .execute();

        const document = await this.userDocuments.findOne({
            where: { id, anonymousWorkspaceId: workspaceId },
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });

        return document ? toUserDocumentRecord(document) : null;
    }

    // Nạp đúng document trong thùng rác cùng file metadata để application kiểm tra khả năng khôi phục.
    async findDeletedUserDocumentByIdForWorkspace(
        id: string,
        workspaceId: string,
    ): Promise<UserDocumentRecord | null> {
        const document = await this.userDocuments.findOne({
            where: { id, anonymousWorkspaceId: workspaceId },
            withDeleted: true,
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });

        // withDeleted cũng tìm được hàng đang hoạt động; chỉ trả record có deleted_at để giữ contract rõ ràng.
        return document?.deletedAt ? toUserDocumentRecord(document) : null;
    }

    // Trả metadata của workspace theo ngày cập nhật giảm dần; tìm kiếm chỉ áp dụng trong phạm vi owner đó.
    async listUserDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
    ): Promise<{ items: UserDocumentRecord[]; total: number }> {
        return this.listDocumentsByWorkspace(workspaceId, query, false);
    }

    // Đọc riêng tài liệu đã xóa mềm để API thùng rác chỉ trả các hàng có deleted_at.
    async listDeletedUserDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
    ): Promise<{ items: UserDocumentRecord[]; total: number }> {
        return this.listDocumentsByWorkspace(workspaceId, query, true);
    }

    // Dùng chung lọc, sắp xếp và phân trang nhưng giữ trạng thái xóa tách biệt rõ ràng.
    private async listDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
        deletedOnly: boolean,
    ): Promise<{ items: UserDocumentRecord[]; total: number }> {
        const builder = this.userDocuments
            .createQueryBuilder('document')
            .leftJoinAndSelect('document.outputFile', 'outputFile')
            .leftJoinAndSelect(
                'document.sourceTemplateVersion',
                'sourceVersion',
            )
            .leftJoinAndSelect('sourceVersion.template', 'sourceTemplate')
            .where('document.anonymousWorkspaceId = :workspaceId', {
                workspaceId,
            });

        if (deletedOnly) {
            // withDeleted cần thiết để thấy hàng trong thùng rác; điều kiện dưới đây giới hạn đúng document đã xóa.
            builder.withDeleted();
            builder.andWhere('document.deletedAt IS NOT NULL');
            // withDeleted mở rộng truy vấn cho mọi alias; template đã lưu trữ vẫn được loại như ở danh sách thường.
            builder.andWhere(
                '(sourceTemplate.deletedAt IS NULL OR sourceTemplate.id IS NULL)',
            );
        } else {
            // Điều kiện tường minh giữ contract danh sách hoạt động kể cả khi cấu hình ORM thay đổi.
            builder.andWhere('document.deletedAt IS NULL');
        }

        const search = query.search?.trim();
        if (search) {
            builder.andWhere('document.title ILIKE :search', {
                search: `%${search}%`,
            });
        }

        const [documents, total] = await builder
            .orderBy('document.updatedAt', 'DESC')
            .addOrderBy('document.id', 'DESC')
            .skip((query.page - 1) * query.limit)
            .take(query.limit)
            .getManyAndCount();

        return {
            items: documents.map(toUserDocumentRecord),
            total,
        };
    }
}
