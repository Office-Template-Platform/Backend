// TypeORM adapter xóa mềm theo workspace; file output và metadata luôn được giữ để khôi phục.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import type { UserDocumentDeleterContract } from '@/modules/user-document-management/application/contracts/user-document-deleter.contract';

@Injectable()
// Adapter giữ transaction, row lock và soft-delete trong infrastructure; file không bị xóa.
export class TypeOrmUserDocumentDeleterRepository implements UserDocumentDeleterContract {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    // Chỉ đặt deleted_at cho document đúng workspace; file object và StoredFile row được giữ để khôi phục.
    async deleteForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            // Bước 1: khóa đúng row thuộc workspace để callback hoặc thao tác lưu không chạy đồng thời với xóa.
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId, anonymousWorkspaceId: workspaceId },
                lock: { mode: 'pessimistic_write' },
            });

            // ID thiếu, đã xóa hoặc thuộc workspace khác đều được báo như nhau ở application boundary.
            if (!document) {
                return false;
            }

            // Bước 2: giữ nguyên document, output FK và StoredFile; chỉ ghi nhận thời điểm xóa mềm.
            const deleteResult = await manager.softDelete(UserDocument, {
                id: document.id,
                anonymousWorkspaceId: workspaceId,
            });

            if (!deleteResult.affected) {
                // Không báo xóa thành công nếu DB không xác nhận row đã chuyển sang deleted_at.
                throw new Error('User document could not be soft-deleted.');
            }

            // Báo thành công sau khi transaction có thể commit; không gọi adapter storage ở bất kỳ nhánh nào.
            return true;
        });
    }
}
