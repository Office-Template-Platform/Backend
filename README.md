![Office Template Platform — thư viện mẫu văn bản và trình chiếu](https://raw.githubusercontent.com/Office-Template-Platform/Frontend/main/src/assets/office-template-platform-banner.png)

<div align="center">

# Office Template API

API cho hai thư viện mẫu văn bản và mẫu trình chiếu.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Swagger](https://img.shields.io/badge/API-Swagger-85EA2D?logo=swagger&logoColor=black)

</div>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Chạy ứng dụng](#chạy-ứng-dụng)
- [API hiện có](#api-hiện-có)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Tính năng và trạng thái](#tính-năng-và-trạng-thái)
- [Lệnh phát triển](#lệnh-phát-triển)

## Tổng quan

Office Template API cung cấp điểm truy cập HTTP cho thư viện mẫu văn bản và thư viện mẫu trình chiếu. Mỗi thư viện là một feature riêng, có controller, application service và kiểu dữ liệu metadata riêng.

API hiện có health check và hai endpoint danh mục. Các endpoint danh mục trả về mảng rỗng cho đến khi repository và dữ liệu mẫu được triển khai.

> [!IMPORTANT]
> API chạy cục bộ và đọc cấu hình từ `api/.env`. Source hiện không cấu hình telemetry hoặc kết nối dịch vụ bên ngoài. `npm ci` tải package từ npm; `npm run build` tạo `dist/`. Xóa `.env`, `node_modules` và `dist` để dọn môi trường phát triển.

## Chạy ứng dụng

### Yêu cầu

- Node.js `22.x`
- npm

### Cài đặt và khởi chạy

```powershell
cd api
npm ci

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

npm run dev
```

API chạy tại `http://localhost:3001` theo cấu hình mặc định. Mở `http://localhost:3001/docs` để xem tài liệu Swagger UI.

### Kiểm tra nhanh

```powershell
curl.exe http://localhost:3001/api/health
curl.exe http://localhost:3001/api/document-templates
curl.exe http://localhost:3001/api/presentation-templates
```

## API hiện có

Base URL mặc định: `http://localhost:3001/api`

| Phương thức | Đường dẫn                 | Mô tả                            | Kết quả hiện tại    |
| ----------- | ------------------------- | -------------------------------- | ------------------- |
| `GET`       | `/health`                 | Kiểm tra tiến trình API          | Trả trạng thái `ok` |
| `GET`       | `/document-templates`     | Liệt kê metadata mẫu văn bản     | Trả `[]`            |
| `GET`       | `/presentation-templates` | Liệt kê metadata mẫu trình chiếu | Trả `[]`            |

Ví dụ response của `GET /health`:

```json
{
    "status": "ok",
    "timestamp": "2026-10-29T12:00:00.000Z",
    "uptimeSeconds": 42
}
```

`timestamp` và `uptimeSeconds` thay đổi theo tiến trình đang chạy. Hai endpoint danh mục hiện trả về `[]`; kiểu metadata dự kiến được mô tả trong application contract của từng feature.

## Cấu hình môi trường

Tạo `api/.env` từ `.env.example` trước khi chạy ứng dụng:

| Biến         | Mặc định                | Mục đích                           |
| ------------ | ----------------------- | ---------------------------------- |
| `PORT`       | `3001`                  | Cổng HTTP API                      |
| `NODE_ENV`   | `development`           | Môi trường chạy                    |
| `WEB_ORIGIN` | `http://localhost:3000` | Origin frontend được phép qua CORS |

Không commit `.env`; file này dành cho cấu hình của môi trường phát triển.

## Cấu trúc thư mục

```text
api/
├── src/
│   ├── bootstrap/
│   │   └── api/
│   │       ├── app.module.ts
│   │       ├── create-api-app.ts
│   │       └── main.ts
│   └── modules/
│       ├── health/
│       │   ├── presentation/controllers/health.controller.ts
│       │   └── health.module.ts
│       ├── document-template-library/
│       │   ├── application/
│       │   │   ├── services/list-document-templates.service.ts
│       │   │   └── types/document-template-summary.ts
│       │   ├── presentation/controllers/document-templates.controller.ts
│       │   └── document-template-library.module.ts
│       └── presentation-template-library/
│           ├── application/
│           │   ├── services/list-presentation-templates.service.ts
│           │   └── types/presentation-template-summary.ts
│           ├── presentation/controllers/presentation-templates.controller.ts
│           └── presentation-template-library.module.ts
├── test/
│   └── jest-e2e.json
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

`bootstrap/api` cấu hình và khởi chạy HTTP app. Trong mỗi feature, controller thuộc `presentation`; service và contract thuộc `application`. Persistence, lưu file và tạo bản sao tài liệu chưa được triển khai.

## Tính năng và trạng thái

| Hạng mục                                      | Trạng thái                |
| --------------------------------------------- | ------------------------- |
| NestJS bootstrap, CORS, validation và Swagger | Đã triển khai             |
| Health check                                  | Đã triển khai             |
| Endpoint danh mục cho hai loại mẫu            | Có route, chưa có dữ liệu |
| Repository và kết nối database                | Chưa triển khai           |
| Đọc, xem trước, tạo bản sao và tải DOCX/PPTX  | Chưa triển khai           |

Các dependency database và queue còn trong `package.json` từ cấu hình trước; module hiện tại chưa kết nối PostgreSQL hoặc Redis.

## Lệnh phát triển

Chạy trong thư mục `api`:

| Lệnh                 | Mục đích                                |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Chạy NestJS ở chế độ watch              |
| `npm run build`      | Build API và viết lại alias cho runtime |
| `npm run start:prod` | Chạy ứng dụng đã build trong `dist/`    |
| `npm run type-check` | Kiểm tra kiểu TypeScript                |
| `npm run lint`       | Kiểm tra source bằng ESLint             |

## Tích hợp frontend

Frontend hiện đặt `VITE_API_BASE_URL` mặc định là `http://localhost:3001/api`, nhưng chưa gửi request tới API. Khi kết nối được triển khai, hai danh mục sẽ được tải qua các endpoint tương ứng ở trên.

## Giấy phép

Package API đang được đánh dấu `UNLICENSED`; chưa có giấy phép sử dụng công khai.
