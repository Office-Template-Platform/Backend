// Module gốc ghép health check và hai feature nghiệp vụ riêng.
import { Module } from '@nestjs/common';
import { DocumentTemplateLibraryModule } from
    '@/modules/document-template-library/document-template-library.module';
import { HealthModule } from '@/modules/health/health.module';
import { PresentationTemplateLibraryModule } from
    '@/modules/presentation-template-library/presentation-template-library.module';

// Giữ các sản phẩm độc lập và không đăng ký persistence cũ ở cấp ứng dụng.
@Module({
    imports: [
        HealthModule,
        DocumentTemplateLibraryModule,
        PresentationTemplateLibraryModule,
    ],
})
export class AppModule {}
