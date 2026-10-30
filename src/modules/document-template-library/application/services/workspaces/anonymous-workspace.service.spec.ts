// Nhóm unit test cho AnonymousWorkspaceService: kiểm tra tạo token khó đoán, chỉ lưu hash và từ chối token hết hạn.
// | STT | Test case       | Mục đích                               | Các bước làm                              | Kết quả mong đợi                         |
// |-----|-----------------|----------------------------------------|-------------------------------------------|------------------------------------------|
// | 1   | Workspace mới  | Cấp danh tính cho trình duyệt lần đầu  | Repository chưa có token; gọi resolve    | Trả token mới và lưu SHA-256 của token   |
// | 2   | Token còn hạn   | Gia hạn workspace đang hoạt động         | Repository tìm ID; gọi resolve với token | Trả ID cũ, gia hạn expiry và cookie      |
// | 3   | Token sai dạng  | Không truy vấn hash tùy ý               | Gửi token ngắn; gọi resolve              | Cấp workspace mới                       |
// | 4   | Token hết hạn   | Không mở lại workspace cũ              | Repository trả null; gọi resolve         | Cấp token và workspace khác             |

import { createHash } from 'node:crypto';
import type { AnonymousWorkspaceRepositoryContract } from '@/modules/document-template-library/application/contracts/anonymous-workspace-repository.contract';
import {
    ANONYMOUS_WORKSPACE_TTL_MS,
    AnonymousWorkspaceService,
} from '@/modules/document-template-library/application/services/workspaces/anonymous-workspace.service';

describe('AnonymousWorkspaceService', () => {
    let target: AnonymousWorkspaceService;
    let mockWorkspaceRepository: jest.Mocked<AnonymousWorkspaceRepositoryContract>;

    beforeEach(() => {
        mockWorkspaceRepository = {
            create: jest.fn(),
            findActiveIdByTokenHash: jest.fn(),
            updateActivity: jest.fn(),
        };
        target = new AnonymousWorkspaceService(mockWorkspaceRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 đảm bảo token chỉ xuất hiện trong cookie response, còn database nhận hash một chiều.
    it('should issue a new random token and persist only its SHA-256 hash', async () => {
        // Bước 1 - Arrange: repository tạo ID cho workspace chưa từng thấy.
        mockWorkspaceRepository.create.mockResolvedValue('workspace-1');

        // Bước 2 - Act: phân giải request chưa có token trình duyệt.
        const result = await target.resolve();

        // Bước 3 - Assert: token đủ entropy, chỉ hash được gửi xuống persistence.
        expect(result).toMatchObject({
            id: 'workspace-1',
            shouldSetCookie: true,
        });
        expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const persistedWorkspace =
            mockWorkspaceRepository.create.mock.calls[0]?.[0];
        expect(persistedWorkspace?.tokenHash).toBe(
            createHash('sha256').update(result.token).digest('hex'),
        );
        expect(persistedWorkspace?.lastSeenAt).toBeInstanceOf(Date);
        expect(persistedWorkspace?.expiresAt).toBeInstanceOf(Date);
        expect(persistedWorkspace?.tokenHash).not.toBe(result.token);
    });

    // Test 2 xác nhận cookie hợp lệ gắn lại cùng workspace và làm mới mốc hoạt động.
    it('should reuse a workspace for a valid unexpired token', async () => {
        // Bước 1 - Arrange: repository nhận đúng hash và tìm thấy workspace hiện hành.
        const token = 'a'.repeat(43);
        mockWorkspaceRepository.findActiveIdByTokenHash.mockResolvedValue(
            'workspace-2',
        );

        // Bước 2 - Act: resolve token cookie đã cấp trước đó.
        const result = await target.resolve(token);

        // Bước 3 - Assert: giữ ID/token, làm mới cookie và gia hạn cùng một workspace.
        expect(result).toEqual({
            id: 'workspace-2',
            token,
            shouldSetCookie: true,
        });
        expect(
            mockWorkspaceRepository.findActiveIdByTokenHash.mock.calls[0][0],
        ).toBe(createHash('sha256').update(token).digest('hex'));
        const activityUpdate =
            mockWorkspaceRepository.updateActivity.mock.calls[0];
        expect(activityUpdate?.[0]).toBe('workspace-2');
        expect(activityUpdate?.[1]).toBeInstanceOf(Date);
        expect(activityUpdate?.[2]).toBeInstanceOf(Date);
        expect(
            activityUpdate?.[2].getTime() - activityUpdate?.[1].getTime(),
        ).toBe(ANONYMOUS_WORKSPACE_TTL_MS);
        expect(mockWorkspaceRepository.create.mock.calls).toHaveLength(0);
    });

    // Test 3 chặn token tùy ý trước bước hash/query để header lớn hoặc sai định dạng không đi vào DB.
    it('should replace a malformed token without querying its hash', async () => {
        // Bước 1 - Arrange: token cookie không đúng định dạng 256-bit base64url.
        mockWorkspaceRepository.create.mockResolvedValue('workspace-3');

        // Bước 2 - Act: resolve giá trị sai định dạng.
        const result = await target.resolve('short-token');

        // Bước 3 - Assert: tạo token mới mà không truy vấn workspace bằng input không hợp lệ.
        expect(result.id).toBe('workspace-3');
        expect(result.shouldSetCookie).toBe(true);
        expect(
            mockWorkspaceRepository.findActiveIdByTokenHash.mock.calls,
        ).toHaveLength(0);
    });

    // Test 4 coi token đã hết hạn là danh tính mới để không hồi sinh credential cũ.
    it('should create a new workspace when the stored token has expired', async () => {
        // Bước 1 - Arrange: hash hợp lệ nhưng repository không tìm thấy phiên còn hạn.
        const token = 'b'.repeat(43);
        mockWorkspaceRepository.findActiveIdByTokenHash.mockResolvedValue(null);
        mockWorkspaceRepository.create.mockResolvedValue('workspace-4');

        // Bước 2 - Act: resolve token cũ.
        const result = await target.resolve(token);

        // Bước 3 - Assert: token cũ bị thay và workspace mới được lưu.
        expect(result).toMatchObject({
            id: 'workspace-4',
            shouldSetCookie: true,
        });
        expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(result.token).not.toBe(token);
        expect(mockWorkspaceRepository.create.mock.calls).toHaveLength(1);
    });
});
