// Lấy workspace ID đã được guard xác thực, không nhận owner ID từ body hoặc query client gửi lên.
import {
    createParamDecorator,
    ExecutionContext,
    InternalServerErrorException,
} from '@nestjs/common';
import type { AnonymousWorkspaceRequest } from '@/modules/user-document-management/presentation/types/anonymous-workspace-request';

// Từ chối cấu hình route thiếu guard thay vì chạy query với workspace ID rỗng.
export const CurrentAnonymousWorkspaceId = createParamDecorator(
    (_data: unknown, context: ExecutionContext): string => {
        const request = context
            .switchToHttp()
            .getRequest<AnonymousWorkspaceRequest>();

        if (!request.anonymousWorkspaceId) {
            throw new InternalServerErrorException(
                'Route tài liệu chưa xác thực anonymous workspace.',
            );
        }

        return request.anonymousWorkspaceId;
    },
);
