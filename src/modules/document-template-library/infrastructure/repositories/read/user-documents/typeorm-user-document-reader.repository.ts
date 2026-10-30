// TypeORM read adapter cho tài liệu người dùng và các quan hệ snapshot cần cho metadata.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
    UserDocumentListQuery,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { toUserDocumentRecord } from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';

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

    // Trả metadata của workspace theo ngày cập nhật giảm dần; tìm kiếm chỉ áp dụng trong phạm vi owner đó.
    async listUserDocumentsByWorkspace(
        workspaceId: string,
        query: UserDocumentListQuery,
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
