import type { MigrationInterface, QueryRunner } from 'typeorm';

// Thêm workspace trình duyệt và ràng buộc tài liệu mới vào đúng workspace.
export class AddAnonymousDocumentWorkspaces1793380800000 implements MigrationInterface {
    name = 'AddAnonymousDocumentWorkspaces1793380800000';

    // Giữ tài liệu cũ ở trạng thái chưa gán để thiết bị mở URL cũ có thể claim nguyên tử lần đầu.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "anonymous_workspaces" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "token_hash" character varying(64) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_anonymous_workspaces" PRIMARY KEY ("id"),
                CONSTRAINT "uq_anonymous_workspaces_token_hash" UNIQUE ("token_hash")
            )
        `);
        await queryRunner.query(
            'CREATE INDEX "idx_anonymous_workspaces_expires_at" ON "anonymous_workspaces" ("expires_at")',
        );
        await queryRunner.query(`
            ALTER TABLE "user_documents"
            ADD "anonymous_workspace_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "user_documents"
            ADD CONSTRAINT "fk_user_documents_anonymous_workspace"
            FOREIGN KEY ("anonymous_workspace_id")
            REFERENCES "anonymous_workspaces"("id") ON DELETE RESTRICT
        `);
        await queryRunner.query(
            'CREATE INDEX "idx_user_documents_workspace_updated" ON "user_documents" ("anonymous_workspace_id", "updated_at")',
        );
    }

    // Gỡ khóa và cột liên kết trước khi xóa workspace để migration có thể rollback an toàn.
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'DROP INDEX "idx_user_documents_workspace_updated"',
        );
        await queryRunner.query(`
            ALTER TABLE "user_documents"
            DROP CONSTRAINT "fk_user_documents_anonymous_workspace"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_documents"
            DROP COLUMN "anonymous_workspace_id"
        `);
        await queryRunner.query(
            'DROP INDEX "idx_anonymous_workspaces_expires_at"',
        );
        await queryRunner.query('DROP TABLE "anonymous_workspaces"');
    }
}
