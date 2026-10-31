// TypeORM adapter khôi phục mềm theo workspace trong transaction có khóa hàng.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import type { UserDocumentRestorerContract } from '@/modules/user-document-management/application/contracts/user-document-restorer.contract';

@Injectable()
// Adapter cô lập thao tác restore khỏi service và chỉ cập nhật hàng đã xóa mềm.
export class TypeOrmUserDocumentRestorerRepository implements UserDocumentRestorerContract {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    // Khóa bản ghi đã xóa trong đúng workspace để restore không thể chạy nhầm owner hoặc đua với thao tác khác.
    async restoreForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            // Bước 1: withDeleted cho phép đọc hàng trong thùng rác; điều kiện deletedAt ngăn restore tài liệu đang hoạt động.
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId, anonymousWorkspaceId: workspaceId },
                withDeleted: true,
                lock: { mode: 'pessimistic_write' },
            });

            if (!document?.deletedAt) {
                // Thiếu hàng, sai owner và đã hoạt động đều không có thao tác restore hợp lệ.
                return false;
            }

            // Bước 2: gỡ deleted_at trên đúng hàng đang khóa, giữ nguyên file, title và liên kết template.
            const restoreResult = await manager.restore(UserDocument, {
                id: document.id,
                anonymousWorkspaceId: workspaceId,
            });

            if (!restoreResult.affected) {
                // Nếu hàng đang khóa không được cập nhật, rollback thay vì báo khôi phục thành công giả.
                throw new Error('User document could not be restored.');
            }

            return true;
        });
    }
}
