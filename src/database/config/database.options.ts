import { join } from 'node:path';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { PresentationSlidePreview } from '@/database/entities/presentation-slide-preview.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { TemplateCategory } from '@/database/entities/template-category.entity';
import { UserDocument } from '@/database/entities/user-document.entity';

// Tạo cấu hình PostgreSQL dùng chung cho Nest runtime và TypeORM migration CLI.
// Kết nối luôn tắt synchronize; thay đổi schema chỉ đi qua migration đã review.
export function createDatabaseOptions(): PostgresDataSourceOptions {
    const username = process.env.DB_USER?.trim();
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME?.trim();

    // Từ chối khởi động khi thiếu credential để không âm thầm kết nối nhầm database.
    if (!username || !password || !database) {
        throw new Error(
            'DB_USER, DB_PASSWORD và DB_NAME phải được cấu hình trước khi kết nối PostgreSQL.',
        );
    }

    const rawPort = process.env.DB_PORT ?? '5432';
    const port = Number(rawPort);

    // Kiểm tra cổng trước khi chuyển cấu hình cho driver để báo lỗi môi trường dễ hiểu.
    if (
        !/^\d+$/.test(rawPort) ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        throw new Error(
            'DB_PORT phải là số nguyên trong khoảng từ 1 đến 65535.',
        );
    }

    // Dùng đường dẫn glob dạng POSIX để CLI hoạt động ổn định trên Windows và Linux.
    const migrationPath = join(
        __dirname,
        '..',
        'migrations',
        '*{.ts,.js}',
    ).replace(/\\/g, '/');

    return {
        type: 'postgres',
        host: process.env.DB_HOST?.trim() || 'localhost',
        port,
        username,
        password,
        database,
        installExtensions: false,
        ssl: process.env.DB_SSL === 'true',
        logging: process.env.DB_LOGGING === 'true',
        entities: [
            TemplateCategory,
            OfficeTemplate,
            OfficeTemplateVersion,
            StoredFile,
            PresentationSlidePreview,
            UserDocument,
        ],
        migrations: [migrationPath],
        migrationsRun: false,
        migrationsTransactionMode: 'all',
        migrationsTableName: 'office_template_migrations',
        synchronize: false,
        uuidExtension: 'pgcrypto',
    };
}
