// File khởi động HTTP API; cấu hình request lifecycle nằm trong `http/`.
import { createApiApp } from '@/bootstrap/api/create-api-app';

// Khởi chạy API, lấy URL công khai từ cấu hình hoặc dựng URL local theo PORT.
// Chỉ in banner sau khi listen thành công để STATUS RUNNING phản ánh đúng trạng thái.
// Lỗi tạo app, URL cấu hình hoặc mở cổng tiếp tục nổi lên để process báo khởi động thất bại.
async function bootstrap() {
    const app = await createApiApp();
    const port = Number(process.env.PORT ?? 3001);
    const environment = (process.env.NODE_ENV ?? 'development').toUpperCase();

    // API_URL gồm global prefix `/api`; bỏ slash cuối để ghép các endpoint ổn định.
    const apiBaseUrl = (
        process.env.API_URL ?? `http://localhost:${port}/api`
    ).replace(/\/+$/, '');
    const swaggerUrl = `${apiBaseUrl}/docs`;
    const healthUrl = `${apiBaseUrl}/health`;

    // Bind mọi network interface để cổng API có thể được publish từ Docker container.
    await app.listen(port, '0.0.0.0');

    console.log(`
╭─ OFFICE TEMPLATE API ───────────────────────────────────
│  STATUS       RUNNING
│  ENVIRONMENT  ${environment}
│  API          ${apiBaseUrl}
│  SWAGGER      ${swaggerUrl}
│  HEALTH       ${healthUrl}
│  PORT         ${port}
╰─────────────────────────────────────────────────────────
`);
}

void bootstrap();
