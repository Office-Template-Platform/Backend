// Nhóm unit test cho AnonymousWorkspaceGuard: kiểm tra nhận cookie, gắn owner ID và phát cookie HttpOnly khi cần.
// | STT | Test case         | Mục đích                              | Các bước làm                                   | Kết quả mong đợi                         |
// |-----|-------------------|---------------------------------------|------------------------------------------------|------------------------------------------|
// | 1   | Cookie còn hạn    | Tái sử dụng và gia hạn workspace       | Gửi cookie đúng tên; gọi canActivate           | Gắn ID request, làm mới thời hạn cookie  |
// | 2   | Cookie thiếu      | Tạo workspace cho browser mới         | Không gửi cookie; service cấp workspace        | Gắn ID và set cookie HttpOnly            |
// | 3   | Cookie sai dạng   | Không chuyển token tùy ý vào service  | Gửi chuỗi ngắn; gọi canActivate                 | Service nhận undefined và cấp cookie mới|

import type { ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { ANONYMOUS_WORKSPACE_TTL_MS } from '@/modules/user-document-management/application/services/workspaces/anonymous-workspace.service';
import type { AnonymousWorkspaceService } from '@/modules/user-document-management/application/services/workspaces/anonymous-workspace.service';
import { AnonymousWorkspaceGuard } from '@/modules/user-document-management/presentation/guards/anonymous-workspace.guard';
import type { AnonymousWorkspaceRequest } from '@/modules/user-document-management/presentation/types/anonymous-workspace-request';

describe('AnonymousWorkspaceGuard', () => {
    let target: AnonymousWorkspaceGuard;
    let mockWorkspaceService: jest.Mocked<
        Pick<AnonymousWorkspaceService, 'resolve'>
    >;

    beforeEach(() => {
        mockWorkspaceService = { resolve: jest.fn() };
        target = new AnonymousWorkspaceGuard(
            mockWorkspaceService as unknown as AnonymousWorkspaceService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 giữ token hiện tại nhưng làm mới thời hạn cookie khi workspace còn hoạt động.
    it('should attach and refresh a workspace for a valid cookie', async () => {
        // Bước 1 - Arrange: request gửi cookie workspace và service xác nhận ID hiện hành.
        const token = 'a'.repeat(43);
        const request = {
            headers: {
                cookie: `other=value; office_template_workspace=${token}`,
            },
            anonymousWorkspaceId: '',
        } as AnonymousWorkspaceRequest;
        const mockCookie = jest.fn<Response, Parameters<Response['cookie']>>();
        const response = { cookie: mockCookie } as unknown as Response;
        mockWorkspaceService.resolve.mockResolvedValue({
            id: 'workspace-1',
            token,
            shouldSetCookie: true,
        });
        const context = createExecutionContext(request, response);

        // Bước 2 - Act: chạy guard trước endpoint tài liệu.
        const result = await target.canActivate(context);

        // Bước 3 - Assert: request mang owner đã tra cứu và cookie được gia hạn cùng token.
        expect(result).toBe(true);
        expect(request.anonymousWorkspaceId).toBe('workspace-1');
        expect(mockWorkspaceService.resolve.mock.calls).toEqual([[token]]);
        expect(mockCookie.mock.calls).toEqual([
            [
                'office_template_workspace',
                token,
                {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/api',
                    maxAge: ANONYMOUS_WORKSPACE_TTL_MS,
                },
            ],
        ]);
    });

    // Test 2 cấp cookie bền vững nhưng HttpOnly để JavaScript trang không đọc được bearer token.
    it('should issue an HttpOnly cookie for a browser without a workspace', async () => {
        // Bước 1 - Arrange: browser chưa gửi cookie và service tạo token/workspace mới.
        const token = 'b'.repeat(43);
        const request = {
            headers: {},
            anonymousWorkspaceId: '',
        } as AnonymousWorkspaceRequest;
        const mockCookie = jest.fn<Response, Parameters<Response['cookie']>>();
        const response = { cookie: mockCookie } as unknown as Response;
        mockWorkspaceService.resolve.mockResolvedValue({
            id: 'workspace-2',
            token,
            shouldSetCookie: true,
        });
        const context = createExecutionContext(request, response);

        // Bước 2 - Act: chạy guard để cấp workspace cho lần dùng đầu tiên.
        const result = await target.canActivate(context);

        // Bước 3 - Assert: owner được gắn và cookie giới hạn trong API path, HttpOnly, SameSite.
        expect(result).toBe(true);
        expect(request.anonymousWorkspaceId).toBe('workspace-2');
        expect(mockCookie.mock.calls).toEqual([
            [
                'office_template_workspace',
                token,
                {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/api',
                    maxAge: ANONYMOUS_WORKSPACE_TTL_MS,
                },
            ],
        ]);
    });

    // Test 3 loại cookie không đủ entropy ngay tại HTTP boundary rồi tạo workspace mới.
    it('should ignore a malformed workspace cookie', async () => {
        // Bước 1 - Arrange: cookie có đúng tên nhưng token quá ngắn.
        const request = {
            headers: { cookie: 'office_template_workspace=short' },
            anonymousWorkspaceId: '',
        } as AnonymousWorkspaceRequest;
        const mockCookie = jest.fn<Response, Parameters<Response['cookie']>>();
        const response = { cookie: mockCookie } as unknown as Response;
        mockWorkspaceService.resolve.mockResolvedValue({
            id: 'workspace-3',
            token: 'c'.repeat(43),
            shouldSetCookie: true,
        });
        const context = createExecutionContext(request, response);

        // Bước 2 - Act: truyền request sai cookie qua guard.
        await target.canActivate(context);

        // Bước 3 - Assert: token không được chuyển cho application để hash hoặc tra cứu.
        expect(mockWorkspaceService.resolve.mock.calls).toEqual([[undefined]]);
        expect(request.anonymousWorkspaceId).toBe('workspace-3');
    });
});

// Tạo HTTP context nhỏ để unit test guard mà không khởi tạo Nest hoặc kết nối database.
function createExecutionContext(
    request: AnonymousWorkspaceRequest,
    response: Response,
): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
            getResponse: () => response,
        }),
    } as unknown as ExecutionContext;
}
