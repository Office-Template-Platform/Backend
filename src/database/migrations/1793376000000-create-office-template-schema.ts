import type { MigrationInterface, QueryRunner } from 'typeorm';

// Tạo schema thư viện mẫu, file metadata và tài liệu người dùng cho PostgreSQL 13+.
export class CreateOfficeTemplateSchema1793376000000 implements MigrationInterface {
    name = 'CreateOfficeTemplateSchema1793376000000';

    // Tạo bảng theo thứ tự phụ thuộc để mọi khóa ngoại tham chiếu tới bảng đã tồn tại.
    async up(queryRunner: QueryRunner): Promise<void> {
        // PostgreSQL 13+ cung cấp gen_random_uuid() sẵn, không cần quyền cài extension.
        await queryRunner.query(`
            CREATE TYPE "public"."office_template_product_type_enum" AS ENUM('document', 'presentation')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."office_template_status_enum" AS ENUM('draft', 'published', 'archived')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."file_storage_provider_enum" AS ENUM('local', 's3')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."user_document_status_enum" AS ENUM('provisioning', 'ready', 'failed')
        `);

        await queryRunner.query(`
            CREATE TABLE "template_categories" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying(120) NOT NULL,
                "slug" character varying(140) NOT NULL,
                "description" text,
                "sort_order" integer NOT NULL DEFAULT 0,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ddd88953a0cd7ee62295a90f984" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "stored_files" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "provider" "public"."file_storage_provider_enum" NOT NULL,
                "storage_namespace" character varying(120) NOT NULL,
                "object_key" text NOT NULL,
                "original_filename" character varying(255),
                "mime_type" character varying(160) NOT NULL,
                "size_bytes" bigint NOT NULL,
                "sha256" character(64),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5d5be862bf53851c1794b4adf4e" PRIMARY KEY ("id"),
                CONSTRAINT "chk_stored_files_size_nonnegative" CHECK ("size_bytes" >= 0)
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "office_templates" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "product_type" "public"."office_template_product_type_enum" NOT NULL,
                "category_id" uuid NOT NULL,
                "name" character varying(200) NOT NULL,
                "slug" character varying(220) NOT NULL,
                "description" text,
                "status" "public"."office_template_status_enum" NOT NULL DEFAULT 'draft',
                "is_featured" boolean NOT NULL DEFAULT false,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_1fc2df855ee98d56c02ff95f2e7" PRIMARY KEY ("id"),
                CONSTRAINT "FK_0a1d35675d1d419288fc362d45d" FOREIGN KEY ("category_id") REFERENCES "template_categories"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "office_template_versions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "template_id" uuid NOT NULL,
                "version_number" integer NOT NULL,
                "source_file_id" uuid NOT NULL,
                "thumbnail_file_id" uuid,
                "is_current" boolean NOT NULL DEFAULT false,
                "change_note" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d6995de821d11fcdd4582206ff4" PRIMARY KEY ("id"),
                CONSTRAINT "chk_office_template_versions_number_positive" CHECK ("version_number" > 0),
                CONSTRAINT "FK_0147ebff23b25d9c6af20e317e8" FOREIGN KEY ("template_id") REFERENCES "office_templates"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_6d7d18dfcf87d44d87300f4f3a0" FOREIGN KEY ("source_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_9058870837ee4223df46ea68cfb" FOREIGN KEY ("thumbnail_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "presentation_slide_previews" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "version_id" uuid NOT NULL,
                "slide_number" integer NOT NULL,
                "preview_file_id" uuid NOT NULL,
                "title" character varying(200),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6253875ae080c74cf33f6c1276d" PRIMARY KEY ("id"),
                CONSTRAINT "chk_presentation_slide_previews_number_positive" CHECK ("slide_number" > 0),
                CONSTRAINT "FK_d31248a60b330a5138dcdc528e8" FOREIGN KEY ("version_id") REFERENCES "office_template_versions"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_5db70c0f7d03e4271474bd22057" FOREIGN KEY ("preview_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "user_documents" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "source_template_version_id" uuid NOT NULL,
                "title" character varying(200) NOT NULL,
                "status" "public"."user_document_status_enum" NOT NULL DEFAULT 'provisioning',
                "output_file_id" uuid,
                "failure_code" character varying(80),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cea43819156528b63504c4afd4b" PRIMARY KEY ("id"),
                CONSTRAINT "chk_user_documents_ready_has_file" CHECK ("status" <> 'ready' OR "output_file_id" IS NOT NULL),
                CONSTRAINT "FK_845f0fa6dbf7997059e027e44b2" FOREIGN KEY ("source_template_version_id") REFERENCES "office_template_versions"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_149c393f4032d2a84a11b465c9e" FOREIGN KEY ("output_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT
            )
        `);

        // Unique partial index giữ đúng quy tắc slug sống và một phiên bản hiện hành.
        await queryRunner.query(
            'CREATE INDEX "idx_template_categories_active_order" ON "template_categories" ("is_active", "sort_order")',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_template_categories_slug" ON "template_categories" ("slug")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_stored_files_sha256" ON "stored_files" ("sha256")',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_stored_files_location" ON "stored_files" ("provider", "storage_namespace", "object_key")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_office_templates_featured" ON "office_templates" ("product_type", "is_featured", "published_at")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_office_templates_catalog" ON "office_templates" ("product_type", "status", "category_id")',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_office_templates_live_slug" ON "office_templates" ("product_type", "slug") WHERE "deleted_at" IS NULL',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_office_template_versions_source_file" ON "office_template_versions" ("source_file_id")',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_office_template_versions_current" ON "office_template_versions" ("template_id") WHERE "is_current" = true',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_office_template_versions_number" ON "office_template_versions" ("template_id", "version_number")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_presentation_slide_previews_file" ON "presentation_slide_previews" ("preview_file_id")',
        );
        await queryRunner.query(
            'CREATE UNIQUE INDEX "uq_presentation_slide_previews_position" ON "presentation_slide_previews" ("version_id", "slide_number")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_user_documents_status_updated" ON "user_documents" ("status", "updated_at")',
        );
        await queryRunner.query(
            'CREATE INDEX "idx_user_documents_source_created" ON "user_documents" ("source_template_version_id", "created_at")',
        );
    }

    // Xóa bảng theo chiều ngược quan hệ, sau đó mới xóa các enum không còn được dùng.
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "user_documents"');
        await queryRunner.query('DROP TABLE "presentation_slide_previews"');
        await queryRunner.query('DROP TABLE "office_template_versions"');
        await queryRunner.query('DROP TABLE "office_templates"');
        await queryRunner.query('DROP TABLE "stored_files"');
        await queryRunner.query('DROP TABLE "template_categories"');
        await queryRunner.query(
            'DROP TYPE "public"."user_document_status_enum"',
        );
        await queryRunner.query(
            'DROP TYPE "public"."office_template_status_enum"',
        );
        await queryRunner.query(
            'DROP TYPE "public"."office_template_product_type_enum"',
        );
        await queryRunner.query(
            'DROP TYPE "public"."file_storage_provider_enum"',
        );
    }
}
