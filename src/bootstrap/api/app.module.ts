// Module gốc ghép health check, hai thư viện mẫu và quản lý tài liệu người dùng.
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseOptions } from '@/database/config/database.options';
import { DocumentTemplateLibraryModule } from '@/modules/document-template-library/document-template-library.module';
import { HealthModule } from '@/modules/health/health.module';
import { PresentationTemplateLibraryModule } from '@/modules/presentation-template-library/presentation-template-library.module';
import { UserDocumentManagementModule } from '@/modules/user-document-management/user-document-management.module';

// Ghép health check, thư viện mẫu và kết nối PostgreSQL có quản lý bằng migration.
@Module({
    imports: [
        TypeOrmModule.forRoot(createDatabaseOptions()),
        HealthModule,
        DocumentTemplateLibraryModule,
        UserDocumentManagementModule,
        PresentationTemplateLibraryModule,
    ],
})
export class AppModule {}
