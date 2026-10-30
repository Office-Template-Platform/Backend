// TypeORM adapter xóa mềm theo workspace và xác định output file có thể dọn an toàn.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import {
    type UserDocumentDeleterContract,
    type UserDocumentDeletionResult,
} from '@/modules/document-template-library/application/contracts/user-document-deleter.contract';
import { toStoredFileReference } from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';

@Injectable()
// Adapter giữ transaction, row lock, soft-delete và truy vấn file-reference trong infrastructure.
export class TypeOrmUserDocumentDeleterRepository implements UserDocumentDeleterContract {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    // Xóa mềm chỉ sau khi tìm đúng owner; output được dọn ngoài transaction sau khi commit thành công.
    async deleteForWorkspace(
        documentId: string,
        workspaceId: string,
    ): Promise<UserDocumentDeletionResult | null> {
        return this.dataSource.transaction(async (manager) => {
            // Bước 1: khóa đúng row thuộc workspace để lưu nội dung/callback không thể ghi đè trạng thái xóa.
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId, anonymousWorkspaceId: workspaceId },
                lock: { mode: 'pessimistic_write' },
            });

            // ID thiếu, đã xóa hoặc thuộc workspace khác đều được báo như nhau ở application boundary.
            if (!document) {
                return null;
            }

            // Bước 2: chụp metadata trong cùng transaction; không xóa object trước khi DB xác nhận xóa mềm.
            const outputFile = document.outputFileId
                ? await manager.findOne(StoredFile, {
                      where: { id: document.outputFileId },
                  })
                : null;

            if (document.outputFileId && !outputFile) {
                // FK thiếu metadata là invariant lỗi; rollback thay vì xóa tài liệu nhưng bỏ sót trạng thái file.
                throw new Error(
                    'User document output file disappeared during deletion.',
                );
            }

            // Bước 3: giữ bản ghi, source snapshot và FK trong DB để xóa có thể được khôi phục theo chính sách sau này.
            const deleteResult = await manager.softDelete(UserDocument, {
                id: document.id,
                anonymousWorkspaceId: workspaceId,
            });

            if (!deleteResult.affected) {
                // Không trả file cho cleanup nếu DB không xác nhận row đã chuyển sang deleted_at.
                throw new Error('User document could not be soft-deleted.');
            }

            // Bước 4: tránh xóa nhị phân còn được document hoạt động khác tham chiếu.
            // TypeORM tự lọc soft-deleted rows; Not(id) loại bản ghi vừa xóa khỏi phép kiểm tra.
            const activeReference = outputFile
                ? await manager.findOne(UserDocument, {
                      where: {
                          id: Not(document.id),
                          outputFileId: outputFile.id,
                      },
                      select: { id: true },
                  })
                : null;

            // Kết quả chỉ mang file reference ra ngoài; application thực hiện I/O sau khi transaction resolve.
            return {
                fileToCleanup:
                    outputFile && !activeReference
                        ? toStoredFileReference(outputFile)
                        : null,
            };
        });
    }
}
