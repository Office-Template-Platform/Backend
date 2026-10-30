// Mở rộng request HTTP để mang workspace đã được xác thực bởi AnonymousWorkspaceGuard.
import type { Request } from 'express';

export type AnonymousWorkspaceRequest = Request & {
    anonymousWorkspaceId?: string;
};
