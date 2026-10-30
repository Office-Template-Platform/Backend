// Port lưu hash token workspace; application không phụ thuộc TypeORM hay cookie HTTP.
export type NewAnonymousWorkspace = {
    tokenHash: string;
    lastSeenAt: Date;
    expiresAt: Date;
};

export interface AnonymousWorkspaceRepositoryContract {
    create(input: NewAnonymousWorkspace): Promise<string>;
    findActiveIdByTokenHash(
        tokenHash: string,
        now: Date,
    ): Promise<string | null>;
    updateActivity(
        id: string,
        lastSeenAt: Date,
        expiresAt: Date,
    ): Promise<void>;
}

export const ANONYMOUS_WORKSPACE_REPOSITORY = Symbol(
    'ANONYMOUS_WORKSPACE_REPOSITORY',
);
