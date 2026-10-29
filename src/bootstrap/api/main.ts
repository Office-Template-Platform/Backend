// File khởi động HTTP API; cấu hình transport nằm ở create-api-app.
import { createApiApp } from '@/bootstrap/api/create-api-app';

// Mở cổng API sau khi Nest đã đăng ký module; lỗi khởi động được để Node báo trực tiếp.
async function bootstrap() {
    const app = await createApiApp();
    const port = Number(process.env.PORT ?? 3001);

    // Bind mọi network interface để cổng API có thể được publish từ Docker container.
    await app.listen(port, '0.0.0.0');
}

void bootstrap();
