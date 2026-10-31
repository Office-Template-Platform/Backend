// Nhóm unit test cho TypeOrmUserDocumentDeleterRepository: kiểm tra workspace scope và chỉ ghi soft delete.
// | STT | Test case            | Mục đích                               | Các bước làm                           | Kết quả mong đợi                               |
// |-----|----------------------|----------------------------------------|----------------------------------------|------------------------------------------------|
// | 1   | Đúng workspace      | Khóa và đánh dấu document đã xóa       | Tìm đúng owner; softDelete thành công  | Trả true, không truy vấn StoredFile            |
// | 2   | Không tìm thấy      | Ngăn xóa chéo hoặc xóa lặp              | Query trả null                         | Trả false, không gọi softDelete                 |
// | 3   | DB không cập nhật   | Không báo xóa thành công giả            | softDelete trả affected = 0            | Transaction reject                              |
// | 4   | Database lỗi        | Giữ lỗi adapter nguyên trạng            | findOne reject                         | Truyền nguyên lỗi lên caller                    |

import { DataSource, EntityManager } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import { TypeOrmUserDocumentDeleterRepository } from '@/modules/user-document-management/infrastructure/repositories/write/delete-user-document/typeorm-user-document-deleter.repository';

describe('TypeOrmUserDocumentDeleterRepository', () => {
    let target: TypeOrmUserDocumentDeleterRepository;
    let mockManager: jest.Mocked<Pick<EntityManager, 'findOne' | 'softDelete'>>;
    let mockTransaction: jest.Mock;
    let mockDataSource: DataSource;

    beforeEach(() => {
        mockManager = {
            findOne: jest.fn(),
            softDelete: jest.fn(),
        };
        mockTransaction = jest.fn(
            (work: (manager: EntityManager) => Promise<unknown>) =>
                work(mockManager as unknown as EntityManager),
        );
        mockDataSource = {
            transaction: mockTransaction,
        } as unknown as DataSource;
        target = new TypeOrmUserDocumentDeleterRepository(mockDataSource);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 chứng minh xóa chỉ cập nhật UserDocument.deleted_at và không đọc/xóa output file.
    it('should soft-delete only the document owned by the requested workspace', async () => {
        // Bước 1 - Arrange: document đang hoạt động thuộc workspace-1 và có output_file_id.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: 'file-1',
        });
        mockManager.findOne.mockResolvedValue(document);
        mockManager.softDelete.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: chạy xóa mềm trong transaction.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: khóa owner row, chỉ soft-delete document và trả thành công.
        expect(result).toBe(true);
        expect(mockManager.findOne).toHaveBeenCalledWith(UserDocument, {
            where: {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
            },
            lock: { mode: 'pessimistic_write' },
        });
        expect(mockManager.softDelete).toHaveBeenCalledWith(UserDocument, {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
        });
        expect(mockManager.findOne).toHaveBeenCalledTimes(1);
    });

    // Test 2 bảo đảm document vắng mặt hoặc ngoài workspace không phát sinh thay đổi database.
    it('should return false without updating when the document is not owned by the workspace', async () => {
        // Bước 1 - Arrange: truy vấn theo ID và workspace không tìm thấy hàng hoạt động.
        mockManager.findOne.mockResolvedValue(null);

        // Bước 2 - Act: yêu cầu xóa tài liệu thuộc workspace khác.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-2',
        );

        // Bước 3 - Assert: repository trả false để application ánh xạ thành 404.
        expect(result).toBe(false);
        expect(mockManager.softDelete).not.toHaveBeenCalled();
    });

    // Test 3 rollback nếu lệnh cập nhật deleted_at không tác động hàng đang khóa.
    it('should reject when soft-delete does not update the locked row', async () => {
        // Bước 1 - Arrange: row tồn tại nhưng driver báo affected bằng không.
        mockManager.findOne.mockResolvedValue(
            Object.assign(new UserDocument(), {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
                outputFileId: 'file-1',
            }),
        );
        mockManager.softDelete.mockResolvedValue({
            affected: 0,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act và Bước 3 - Assert: transaction reject thay vì trả thành công giả.
        await expect(
            target.deleteForWorkspace('document-1', 'workspace-1'),
        ).rejects.toThrow('User document could not be soft-deleted.');
        expect(mockManager.softDelete).toHaveBeenCalledTimes(1);
    });

    // Test 4 giữ lỗi đọc database để caller phân biệt sự cố hệ thống với document không tồn tại.
    it('should propagate database failures without changing the error', async () => {
        // Bước 1 - Arrange: query khóa row thất bại do database không sẵn sàng.
        const failure = new Error('database unavailable');
        mockManager.findOne.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: transaction chuyển tiếp nguyên lỗi.
        await expect(
            target.deleteForWorkspace('document-1', 'workspace-1'),
        ).rejects.toBe(failure);
        expect(mockManager.softDelete).not.toHaveBeenCalled();
    });
});
