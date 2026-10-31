// Nhận diện workspace bằng cookie HttpOnly trước khi cho phép đọc hoặc ghi tài liệu cá nhân.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
    ANONYMOUS_WORKSPACE_TTL_MS,
    AnonymousWorkspaceService,
} from '@/modules/user-document-management/application/services/workspaces/anonymous-workspace.service';
import type { AnonymousWorkspaceRequest } from '@/modules/user-document-management/presentation/types/anonymous-workspace-request';

const WORKSPACE_COOKIE_NAME = 'office_template_workspace';

@Injectable()
// Cookie chỉ được gửi bởi trình duyệt; editor-file và callback dùng JWT riêng của ONLYOFFICE.
export class AnonymousWorkspaceGuard implements CanActivate {
    constructor(private readonly workspaceService: AnonymousWorkspaceService) {}

    // Nạp workspace từ token cookie hoặc cấp workspace mới, rồi gắn ID nội bộ vào request.
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const request = http.getRequest<AnonymousWorkspaceRequest>();
        const response = http.getResponse<Response>();
        const token = this.readCookie(
            request.headers.cookie,
            WORKSPACE_COOKIE_NAME,
        );
        const workspace = await this.workspaceService.resolve(token);

        request.anonymousWorkspaceId = workspace.id;
        if (workspace.shouldSetCookie) {
            response.cookie(WORKSPACE_COOKIE_NAME, workspace.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/api',
                maxAge: ANONYMOUS_WORKSPACE_TTL_MS,
            });
        }

        return true;
    }

    // Chỉ đọc đúng cookie do server phát hành; không decode nội dung token để tránh chấp nhận dạng sai.
    private readCookie(
        header: Request['headers']['cookie'],
        cookieName: string,
    ): string | undefined {
        if (!header) return undefined;

        const prefix = `${cookieName}=`;
        const value = header
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix))
            ?.slice(prefix.length);

        return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
    }
}
