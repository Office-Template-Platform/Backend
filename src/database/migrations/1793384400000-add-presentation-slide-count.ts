import type { MigrationInterface, QueryRunner } from 'typeorm';

// Thêm số slide nguồn để catalog PPTX hiển thị metadata thật, độc lập với số ảnh preview đã tạo.
export class AddPresentationSlideCount1793384400000 implements MigrationInterface {
    name = 'AddPresentationSlideCount1793384400000';

    // Null giữ tương thích với phiên bản DOCX; giá trị có số phải luôn là số nguyên dương.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'ALTER TABLE "office_template_versions" ADD "slide_count" integer',
        );
        await queryRunner.query(
            'ALTER TABLE "office_template_versions" ADD CONSTRAINT "chk_office_template_versions_slide_count_positive" CHECK ("slide_count" IS NULL OR "slide_count" > 0)',
        );
    }

    // Rollback chỉ gỡ metadata mới, không thay đổi file mẫu hoặc dữ liệu version hiện có.
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'ALTER TABLE "office_template_versions" DROP CONSTRAINT "chk_office_template_versions_slide_count_positive"',
        );
        await queryRunner.query(
            'ALTER TABLE "office_template_versions" DROP COLUMN "slide_count"',
        );
    }
}
