// Nhóm unit test cho TypeOrmUserDocumentRestorerRepository: kiểm tra restore mềm và workspace boundary.
// | STT | Test case             | Mục đích                                  | Các bước làm                                 | Kết quả mong đợi                              |
// |-----|-----------------------|-------------------------------------------|----------------------------------------------|-----------------------------------------------|
// | 1   | Đã xóa trong workspace| Gỡ deleted_at có khóa hàng                | Tìm withDeleted; restore cùng owner          | Trả true                                      |
// | 2   | Đang hoạt động        | Không chạy restore lặp                    | Tìm thấy deletedAt null                      | Trả false, không gọi restore                   |
// | 3   | Sai owner/không có    | Không khôi phục tài liệu ngoài workspace  | Query không tìm thấy                         | Trả false, không gọi restore                   |
// | 4   | DB không cập nhật     | Không báo thành công giả                    | restore trả affected = 0                     | Transaction reject                             |

import { DataSource, EntityManager } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import { TypeOrmUserDocumentRestorerRepository } from '@/modules/user-document-management/infrastructure/repositories/write/restore-user-document/typeorm-user-document-restorer.repository';

describe('TypeOrmUserDocumentRestorerRepository', () => {
    let target: TypeOrmUserDocumentRestorerRepository;
    let mockManager: jest.Mocked<Pick<EntityManager, 'findOne' | 'restore'>>;
    let mockTransaction: jest.Mock;
    let mockDataSource: DataSource;

    beforeEach(() => {
        mockManager = {
            findOne: jest.fn(),
            restore: jest.fn(),
        };
        mockTransaction = jest.fn(
            (work: (manager: EntityManager) => Promise<unknown>) =>
                work(mockManager as unknown as EntityManager),
        );
        mockDataSource = {
            transaction: mockTransaction,
        } as unknown as DataSource;
        target = new TypeOrmUserDocumentRestorerRepository(mockDataSource);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận chỉ hàng đã xóa đúng owner được restore; file FK được giữ nguyên.
    it('should restore the soft-deleted document for its workspace', async () => {
        // Bước 1 - Arrange: document trong thùng rác vẫn giữ nguyên output_file_id.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: 'file-1',
            deletedAt: new Date('2026-10-30T10:00:00.000Z'),
        });
        mockManager.findOne.mockResolvedValue(document);
        mockManager.restore.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: khôi phục document trong transaction.
        const result = await target.restoreForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: khóa hàng đã xóa và chỉ gỡ deleted_at theo ID cùng owner.
        expect(result).toBe(true);
        expect(mockManager.findOne).toHaveBeenCalledWith(UserDocument, {
            where: {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
            },
            withDeleted: true,
            lock: { mode: 'pessimistic_write' },
        });
        expect(mockManager.restore).toHaveBeenCalledWith(UserDocument, {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
        });
    });

    // Test 2 chặn gọi restore khi cùng ID đã hoạt động để tránh cập nhật thừa.
    it('should not restore a document that is already active', async () => {
        // Bước 1 - Arrange: withDeleted tìm thấy hàng nhưng deleted_at đang null.
        mockManager.findOne.mockResolvedValue(
            Object.assign(new UserDocument(), {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
                deletedAt: null,
            }),
        );

        // Bước 2 - Act: thử khôi phục document vốn đang hoạt động.
        const result = await target.restoreForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: không phát sinh câu lệnh restore.
        expect(result).toBe(false);
        expect(mockManager.restore).not.toHaveBeenCalled();
    });

    // Test 3 xác nhận hàng không thuộc owner được xử lý như không tồn tại.
    it('should not restore a document outside the current workspace', async () => {
        // Bước 1 - Arrange: query có đủ ID và owner nhưng không có hàng phù hợp.
        mockManager.findOne.mockResolvedValue(null);

        // Bước 2 - Act: workspace khác yêu cầu khôi phục document.
        const result = await target.restoreForWorkspace(
            'document-1',
            'workspace-2',
        );

        // Bước 3 - Assert: trả false và không thay đổi database.
        expect(result).toBe(false);
        expect(mockManager.restore).not.toHaveBeenCalled();
    });

    // Test 4 rollback transaction nếu DB không xác nhận đã gỡ deleted_at.
    it('should reject when restore does not update the locked row', async () => {
        // Bước 1 - Arrange: hàng đã xóa được nạp nhưng câu lệnh restore không tác động row.
        mockManager.findOne.mockResolvedValue(
            Object.assign(new UserDocument(), {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
                deletedAt: new Date('2026-10-30T10:00:00.000Z'),
            }),
        );
        mockManager.restore.mockResolvedValue({
            affected: 0,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act và Bước 3 - Assert: lỗi invariant được truyền lên để transaction rollback.
        await expect(
            target.restoreForWorkspace('document-1', 'workspace-1'),
        ).rejects.toThrow('User document could not be restored.');
    });
});
