// Cấp và xác thực danh tính ẩn danh bằng token ngẫu nhiên; chỉ hash token được lưu ở database.
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
    ANONYMOUS_WORKSPACE_REPOSITORY,
    type AnonymousWorkspaceRepositoryContract,
} from '@/modules/document-template-library/application/contracts/anonymous-workspace-repository.contract';

export const ANONYMOUS_WORKSPACE_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const WORKSPACE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type ResolvedAnonymousWorkspace = {
    id: string;
    token: string;
    shouldSetCookie: boolean;
};

@Injectable()
// Danh tính này đại diện cho hồ sơ trình duyệt, không xác nhận tên hay danh tính pháp lý của người dùng.
export class AnonymousWorkspaceService {
    constructor(
        @Inject(ANONYMOUS_WORKSPACE_REPOSITORY)
        private readonly workspaceRepository: AnonymousWorkspaceRepositoryContract,
    ) {}

    // Dùng token hợp lệ để tìm workspace; cookie sai hoặc hết hạn được thay bằng token mới độc lập.
    async resolve(token?: string): Promise<ResolvedAnonymousWorkspace> {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ANONYMOUS_WORKSPACE_TTL_MS);

        // Nếu token hợp lệ, tìm workspace đang hoạt động; nếu không, tạo workspace mới với token ngẫu nhiên.
        if (token && WORKSPACE_TOKEN_PATTERN.test(token)) {
            const tokenHash = this.hashToken(token);
            const workspaceId =
                await this.workspaceRepository.findActiveIdByTokenHash(
                    tokenHash,
                    now,
                );

            // Nếu workspace còn hoạt động, gia hạn thời gian sống và trả về token cũ để cookie không bị thay đổi.
            if (workspaceId) {
                // Gia hạn đồng thời database và cookie để workspace còn hoạt động khi người dùng quay lại định kỳ.
                await this.workspaceRepository.updateActivity(
                    workspaceId,
                    now,
                    expiresAt,
                );
                return { id: workspaceId, token, shouldSetCookie: true };
            }
        }

        // Token 256-bit đủ ngẫu nhiên để làm bearer credential; database chỉ giữ SHA-256 để giảm tác hại khi lộ DB.
        const newToken = randomBytes(32).toString('base64url');
        const workspaceId = await this.workspaceRepository.create({
            tokenHash: this.hashToken(newToken),
            lastSeenAt: now,
            expiresAt,
        });

        // Trả token mới để cookie được set lại; workspace cũ hết hạn sẽ bị xóa theo cron job.
        return { id: workspaceId, token: newToken, shouldSetCookie: true };
    }

    // Chuẩn hóa token thành hash cố định trước khi repository truy vấn theo unique index.
    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}
