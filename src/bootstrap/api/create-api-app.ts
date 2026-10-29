// File cấu hình Nest HTTP app, validation request và tài liệu OpenAPI.
// File không sở hữu dữ liệu mẫu hoặc logic nghiệp vụ của hai thư viện.
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/bootstrap/api/app.module';

// Tạo Nest app với hợp đồng request chặt và CORS giới hạn cho frontend local.
export async function createApiApp() {
    const app = await NestFactory.create(AppModule);

    // Cho phép Nest hoàn tất cleanup khi process nhận tín hiệu dừng.
    app.enableShutdownHooks();
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    });

    // DTO sẽ được chuyển kiểu và loại bỏ dữ liệu ngoài hợp đồng khi thêm endpoint ghi.
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );

    const swaggerConfig = new DocumentBuilder()
        .setTitle('Office Template API')
        .setDescription('API cho thư viện mẫu văn bản và trình chiếu')
        .setVersion('1.0')
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);

    return app;
}
