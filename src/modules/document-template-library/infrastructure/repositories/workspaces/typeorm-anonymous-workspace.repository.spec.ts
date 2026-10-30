// Nhóm unit test cho TypeOrmAnonymousWorkspaceRepository: kiểm tra tạo hash record, lọc token hết hạn và ghi hoạt động.
// | STT | Test case      | Mục đích                               | Các bước làm                                  | Kết quả mong đợi                  |
// |-----|----------------|----------------------------------------|-----------------------------------------------|-----------------------------------|
// | 1   | Tạo workspace | Lưu thông tin token hash               | Repository save entity; gọi create           | Trả ID workspace                  |
// | 2   | Token hợp lệ  | Chỉ trả workspace chưa hết hạn         | Repository trả entity; gọi find active       | Trả ID và query có expiry         |
// | 3   | Token hết hạn | Không trả workspace đã hết hạn         | Repository trả null; gọi find active          | Trả null                          |
// | 4   | Hoạt động mới | Cập nhật activity và sliding expiry     | Gọi updateActivity                          | Cả hai mốc được cập nhật cùng nhau |

import { MoreThan, Repository } from 'typeorm';
import { AnonymousWorkspace } from '@/database/entities/anonymous-workspace.entity';
import { TypeOrmAnonymousWorkspaceRepository } from '@/modules/document-template-library/infrastructure/repositories/workspaces/typeorm-anonymous-workspace.repository';

describe('TypeOrmAnonymousWorkspaceRepository', () => {
    let target: TypeOrmAnonymousWorkspaceRepository;
    let mockWorkspaces: jest.Mocked<
        Pick<
            Repository<AnonymousWorkspace>,
            'create' | 'save' | 'findOne' | 'update'
        >
    >;

    beforeEach(() => {
        mockWorkspaces = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
        };
        target = new TypeOrmAnonymousWorkspaceRepository(
            mockWorkspaces as unknown as Repository<AnonymousWorkspace>,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận repository chỉ trả ID nội bộ, không trả entity token hash cho HTTP.
    it('should persist a new workspace and return its generated id', async () => {
        // Bước 1 - Arrange: TypeORM tạo và lưu workspace với hash cùng thời hạn.
        const input = {
            tokenHash: 'a'.repeat(64),
            lastSeenAt: new Date('2026-10-30T00:00:00.000Z'),
            expiresAt: new Date('2027-12-04T00:00:00.000Z'),
        };
        mockWorkspaces.create.mockReturnValue(input as AnonymousWorkspace);
        mockWorkspaces.save.mockResolvedValue({
            id: 'workspace-1',
        } as AnonymousWorkspace);

        // Bước 2 - Act: tạo workspace mới qua persistence adapter.
        const result = await target.create(input);

        // Bước 3 - Assert: entity được lưu đúng và caller chỉ nhận ID.
        expect(result).toBe('workspace-1');
        expect(mockWorkspaces.create).toHaveBeenCalledWith(input);
        expect(mockWorkspaces.save).toHaveBeenCalledTimes(1);
    });

    // Test 2 bắt buộc điều kiện expiresAt > now ngay tại query để token quá hạn không được chấp nhận.
    it('should return an id only for an unexpired token hash', async () => {
        // Bước 1 - Arrange: repository tìm thấy workspace theo hash.
        const now = new Date('2026-10-30T00:00:00.000Z');
        mockWorkspaces.findOne.mockResolvedValue({
            id: 'workspace-2',
        } as AnonymousWorkspace);

        // Bước 2 - Act: tra cứu workspace đang còn hạn.
        const result = await target.findActiveIdByTokenHash('hash-2', now);

        // Bước 3 - Assert: TypeORM nhận điều kiện token hash và thời hạn so với hiện tại.
        expect(result).toBe('workspace-2');
        const query = mockWorkspaces.findOne.mock.calls[0]?.[0];
        expect(query?.select).toEqual({ id: true });
        const where = query?.where;
        if (!where || Array.isArray(where)) {
            throw new Error('Expected one workspace where condition.');
        }
        expect(where.tokenHash).toBe('hash-2');
        expect(where.expiresAt).toEqual(MoreThan(now));
    });

    // Test 3 không cho service nhầm token hết hạn thành lỗi truy vấn hoặc ID hợp lệ.
    it('should return null when no active token hash exists', async () => {
        // Bước 1 - Arrange: không có workspace thỏa thời hạn.
        mockWorkspaces.findOne.mockResolvedValue(null);

        // Bước 2 - Act: tìm token không còn hiệu lực.
        const result = await target.findActiveIdByTokenHash(
            'expired-hash',
            new Date('2026-10-30T00:00:00.000Z'),
        );

        // Bước 3 - Assert: adapter trả null để service tạo workspace mới.
        expect(result).toBeNull();
    });

    // Test 4 ghi thời điểm hoạt động cho đúng workspace mà không thay token hoặc thời hạn.
    it('should update the last-seen timestamp for the resolved workspace', async () => {
        // Bước 1 - Arrange: chuẩn bị mốc hoạt động mới.
        const lastSeenAt = new Date('2026-10-30T01:00:00.000Z');
        const expiresAt = new Date('2027-12-04T01:00:00.000Z');

        // Bước 2 - Act: cập nhật workspace đã xác thực.
        await target.updateActivity('workspace-4', lastSeenAt, expiresAt);

        // Bước 3 - Assert: update chỉ đổi timestamp của record tương ứng.
        expect(mockWorkspaces.update).toHaveBeenCalledWith('workspace-4', {
            lastSeenAt,
            expiresAt,
        });
    });
});
