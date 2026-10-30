![Office Template Platform — thư viện mẫu văn bản và trình chiếu](https://raw.githubusercontent.com/Office-Template-Platform/Frontend/main/src/assets/images/office-template-platform-banner.png)

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
- [Chạy PostgreSQL và API bằng Docker](#chạy-postgresql-và-api-bằng-docker)
- [API hiện có](#api-hiện-có)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Mô hình dữ liệu](#mô-hình-dữ-liệu)
- [Tính năng và trạng thái](#tính-năng-và-trạng-thái)
- [Lệnh phát triển](#lệnh-phát-triển)

## Tổng quan

Office Template API cung cấp điểm truy cập HTTP cho thư viện mẫu văn bản và thư viện mẫu trình chiếu. Mỗi thư viện là một feature riêng, có controller, application service và kiểu dữ liệu metadata riêng.

API cung cấp thư viện mẫu DOCX và PPTX với tìm kiếm, lọc danh mục, chi tiết và ảnh xem trước. Người dùng có thể tạo bản sao độc lập, chỉnh sửa DOCX/PPTX qua ONLYOFFICE và tải file đã lưu xuống; file mẫu gốc luôn được giữ nguyên. Seed đăng ký metadata và checksum của các asset trong PostgreSQL; bytes của DOCX/PPTX cùng ảnh WebP/PNG nằm trong thư mục assets.

Các response JSON dùng envelope `{ success, data, meta }`; lỗi dùng `{ success, error, meta }`. Endpoint stream ảnh và file Office giữ nguyên nội dung nhị phân để trình duyệt hiển thị hoặc tải file.

> [!IMPORTANT]
> API đọc cấu hình từ `api/.env`. `npm ci` tải package từ npm; `npm run build` tạo `dist/`. Docker Compose bind API và PostgreSQL vào loopback của máy, không mở các cổng này ra mạng LAN.

## Chạy ứng dụng

### Yêu cầu

- Node.js `22.x`
- npm
- Docker Engine với Docker Compose v2

### Cài đặt và khởi chạy

```powershell
cd api
npm ci

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

docker compose up -d postgres
npm run migration:run:dev
npm run seed:office-templates:dev
npm run dev
```

Để làm mới toàn bộ dữ liệu nghiệp vụ của PostgreSQL local rồi nạp lại các mẫu DOCX/PPTX, chạy lệnh riêng:

```powershell
npm run database:reset-and-seed:dev
```

Lệnh này chỉ chấp nhận `NODE_ENV=development` và `DB_HOST=localhost` hoặc loopback. Nó xóa dữ liệu trong sáu bảng nghiệp vụ hiện có, bao gồm tài liệu người dùng và preview trình chiếu, rồi seed lại catalog DOCX/PPTX trong cùng transaction. Schema và bảng lịch sử migration được giữ nguyên. Không chạy lệnh này trên database dùng chung hoặc production.

Nếu `.env` đã tồn tại, hãy bổ sung các biến Docker Compose và `DB_*` còn thiếu từ `.env.example`; giữ nguyên các giá trị cấu hình khác.

API chạy tại `http://localhost:3001` theo cấu hình mặc định. Mở `http://localhost:3001/api/docs` để xem tài liệu Swagger UI.

### Kiểm tra nhanh

```powershell
curl.exe http://localhost:3001/api/health
curl.exe http://localhost:3001/api/document-templates
curl.exe http://localhost:3001/api/presentation-templates
```

## Chạy PostgreSQL và API bằng Docker

Từ thư mục `api`, tạo `.env` nếu chưa có rồi khởi động stack:

```powershell
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

$databaseVolume = docker volume ls --format '{{.Name}}'
if ($databaseVolume -notcontains 'office-template-api-postgres-data') {
    docker volume create office-template-api-postgres-data
}

docker compose up --build -d
docker compose ps
```

Compose khởi động PostgreSQL 17, đợi health check thành công, chạy migration và seed catalog DOCX/PPTX, rồi mới mở API. PostgreSQL lưu dữ liệu trong volume `office-template-api-postgres-data`; file người dùng tạo nằm trong volume `office-template-api-files`. Cổng host mặc định là `5432`. API chạy tại `http://localhost:3001` và Swagger tại `http://localhost:3001/api/docs`.

```powershell
docker compose logs -f api
docker compose down
```

`docker compose down` giữ nguyên volume database. Chỉ xóa volume nếu chủ động muốn xóa toàn bộ dữ liệu phát triển; không dùng `down -v` khi cần giữ dữ liệu.

Nếu máy đã dùng cổng `5432` hoặc `3001`, đổi `DB_HOST_PORT` hoặc `API_HOST_PORT` trong `.env` trước khi chạy. Khi chỉ cần PostgreSQL cho API chạy bằng Node trên host:

```powershell
docker compose up -d postgres
npm run migration:run:dev
npm run seed:office-templates:dev
npm run dev
```

## API hiện có

Base URL mặc định: `http://localhost:3001/api`

| Phương thức | Đường dẫn                                                         | Mô tả                                                |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `GET`       | `/health`                                                         | Kiểm tra tiến trình API                              |
| `GET`       | `/document-templates`                                             | Tìm kiếm, lọc và phân trang mẫu DOCX                 |
| `GET`       | `/document-templates/categories`                                  | Danh mục và số mẫu đã xuất bản                       |
| `GET`       | `/document-templates/:templateId`                                 | Chi tiết mẫu và phiên bản hiện hành                  |
| `GET`       | `/document-templates/:templateId/preview`                         | Stream ảnh thumbnail                                 |
| `POST`      | `/document-templates/:templateId/documents`                       | Tạo bản DOCX riêng từ mẫu                            |
| `GET`       | `/user-documents`                                                 | Liệt kê tài liệu của workspace hiện tại              |
| `GET`       | `/user-documents/:documentId`                                     | Xem trạng thái và metadata tài liệu đã tạo           |
| `GET`       | `/user-documents/:documentId/editor-config`                       | Lấy cấu hình mở lại tài liệu Office trong ONLYOFFICE |
| `PUT`       | `/user-documents/:documentId/content`                             | Lưu DOCX/PPTX đã chỉnh sửa (multipart field `file`)  |
| `GET`       | `/user-documents/:documentId/download`                            | Tải DOCX/PPTX đầu ra                                 |
| `DELETE`    | `/user-documents/:documentId`                                     | Xóa tài liệu trong workspace hiện tại                |
| `GET`       | `/presentation-templates`                                         | Liệt kê metadata mẫu trình chiếu                     |
| `GET`       | `/presentation-templates/categories`                              | Danh mục và số mẫu trình chiếu                       |
| `GET`       | `/presentation-templates/:templateId`                             | Chi tiết mẫu và các slide có ảnh preview             |
| `GET`       | `/presentation-templates/:templateId/preview`                     | Stream ảnh thumbnail bộ PPTX                         |
| `GET`       | `/presentation-templates/:templateId/slides/:slideNumber/preview` | Stream ảnh preview của một slide                     |
| `POST`      | `/presentation-templates/:templateId/documents`                   | Tạo bản PPTX riêng trong workspace                   |

`GET /document-templates` nhận `page` (mặc định `1`), `limit` (mặc định `12`, tối đa `100`), `search`, `categoryId` và `featured`. `GET /presentation-templates` nhận `search` và `categoryId`, đồng thời giữ response dạng mảng tương thích catalog hiện tại. Ví dụ: `GET /api/document-templates?search=bao-cao&categoryId=<uuid>&page=1&limit=12`.

### Tài liệu theo thiết bị khi chưa có đăng nhập

API cấp cookie `office_template_workspace` dạng `HttpOnly` cho hồ sơ trình duyệt ở lần đầu gọi API tạo hoặc đọc tài liệu. PostgreSQL chỉ lưu SHA-256 của token; API gắn mỗi tài liệu mới với workspace đó và giới hạn danh sách, metadata, tải xuống, cấu hình editor, upload và xóa theo cùng owner. `GET /user-documents` nhận `page` (mặc định `1`), `limit` (mặc định `12`, tối đa `100`) và `search`; danh sách sắp theo `updatedAt` giảm dần để mở lại tài liệu vừa chỉnh.

Để mở lại tài liệu, client lấy `id` từ danh sách rồi gọi `GET /user-documents/:documentId/editor-config`; API chỉ trả cấu hình editor khi ID thuộc workspace hiện tại. ONLYOFFICE tải revision theo URL có chữ ký và lưu bản cuối qua callback đã xác thực JWT.

Workspace đại diện cho một hồ sơ trình duyệt trên máy chạy frontend, không phải tài khoản hoặc đường dẫn lưu trên ổ đĩa của người dùng. Cookie và record được gia hạn thêm 400 ngày mỗi khi workspace hoạt động. Xóa cookie, đổi browser profile hoặc hết hạn cookie sau 400 ngày không hoạt động sẽ mất quyền truy cập workspace đó; file vẫn nằm trong volume của API. Tài liệu tạo trước migration chưa có owner sẽ được gắn cho workspace đầu tiên mở lại tài liệu bằng URL/ID cũ; sau đó workspace khác chỉ nhận 404.

Khi frontend và API có origin khác nhau, browser client cần gửi credentials (`credentials: 'include'`) để nhận và gửi cookie; CORS chỉ chấp nhận `WEB_ORIGIN` đã cấu hình và cho phép credentials. Callback ONLYOFFICE không dùng cookie này: callback tiếp tục xác thực JWT riêng và khóa ghi theo revision file.

### Mẫu DOCX được seed sẵn

| Danh mục    | Mẫu                                                             |
| ----------- | --------------------------------------------------------------- |
| Bản tin     | Báo truyền thống                                                |
| Bản ghi nhớ | Bản ghi nhớ có góc cạnh và đường cong; Bản ghi nhớ màu xanh lam |
| Ứng tuyển   | Tiêu đề vui vẻ                                                  |
| Sự kiện     | Tờ bướm mời dự tiệc; Phiếu quà tặng ngày lễ                     |
| Báo cáo     | Báo cáo                                                         |
| Kinh doanh  | Hóa đơn dịch vụ                                                 |
| Giáo dục    | Lịch công tác Hội phụ huynh giáo viên                           |

### Mẫu PPTX được seed sẵn

| Bộ mẫu                              | Số slide | Danh mục          |
| ----------------------------------- | -------: | ----------------- |
| Bản trình bày phổ biến              |       14 | Kinh doanh        |
| Chứng chỉ đào tạo                   |        1 | Giáo dục          |
| Chứng nhận học bổng                 |        1 | Giáo dục          |
| Giải thưởng nhân viên xuất sắc      |        1 | Chứng nhận        |
| Giấy chứng nhận nhân viên của tháng |        1 | Chứng nhận        |
| Sách nhỏ quảng cáo màu vàng         |        4 | Kinh doanh        |
| Sơ đồ tổ chức đơn giản              |        1 | Sơ đồ & tổ chức   |
| Thiết kế giọt nước                  |       14 | Thiết kế sáng tạo |
| Thiết kế máy tính bảng              |        2 | Giáo dục          |

Seed đồng bộ 9 bộ PPTX có đủ `file.pptx` và `preview.png`. Ảnh bìa được dùng làm thumbnail và preview slide đầu tiên; API chỉ liệt kê các slide đã có ảnh preview, còn `slideCount` là tổng số slide trong file PPTX.

Các mẫu cũ được xóa khỏi catalog và metadata file nếu chưa có tài liệu tham chiếu. Mẫu nào đã được dùng để tạo tài liệu sẽ chuyển sang trạng thái lưu trữ để giữ lịch sử nguồn.

Ví dụ response JSON thành công của `GET /health`:

```json
{
    "success": true,
    "data": {
        "status": "ok",
        "timestamp": "2026-10-29T12:00:00.000Z",
        "uptimeSeconds": 42
    },
    "meta": {
        "timestamp": "2026-10-29T12:00:00.000Z",
        "path": "/api/health",
        "method": "GET"
    }
}
```

`timestamp` và `uptimeSeconds` thay đổi theo tiến trình đang chạy. Danh sách mẫu trả `{ items, total, page, limit, totalPages }` trong trường `data`. Endpoint preview và download trả stream file, không bọc envelope JSON.

## Cấu hình môi trường

Tạo `api/.env` từ `.env.example` trước khi chạy ứng dụng:

| Biến                       | Mặc định                    | Mục đích                                         |
| -------------------------- | --------------------------- | ------------------------------------------------ |
| `PORT`                     | `3001`                      | Cổng HTTP API                                    |
| `NODE_ENV`                 | `development`               | Môi trường chạy                                  |
| `WEB_ORIGIN`               | `http://localhost:3000`     | Origin frontend được phép qua CORS               |
| `FILE_STORAGE_ROOT`        | `./storage`                 | Thư mục lưu tài liệu DOCX/PPTX người dùng tạo    |
| `FILE_STORAGE_ROOT_DOCKER` | `/app/storage`              | Đường dẫn lưu DOCX/PPTX bên trong API container  |
| `DB_HOST`                  | `localhost`                 | Host PostgreSQL khi API chạy trên máy            |
| `DB_PORT`                  | `5432`                      | Cổng PostgreSQL                                  |
| `DB_USER`                  | `office_template`           | User PostgreSQL local                            |
| `DB_PASSWORD`              | `office_template_local_dev` | Mật khẩu chỉ dùng cho môi trường local           |
| `DB_NAME`                  | `office_template`           | Database local                                   |
| `DB_SSL`                   | `false`                     | Bật SSL khi môi trường PostgreSQL yêu cầu        |
| `DB_LOGGING`               | `false`                     | Ghi SQL query vào log khi cần debug              |
| `DB_HOST_PORT`             | `5432`                      | Cổng máy host được Docker publish cho PostgreSQL |
| `API_HOST_PORT`            | `3001`                      | Cổng máy host được Docker publish cho API        |
| `FILE_STORAGE_VOLUME_NAME` | `office-template-api-files` | Volume giữ tài liệu DOCX/PPTX qua lần recreate   |

Không commit `.env`; file này dành cho cấu hình của môi trường phát triển.

`synchronize` luôn tắt. Thay đổi cấu trúc database phải được ghi thành migration rồi mới áp dụng; không bật tự đồng bộ schema trong môi trường phát triển hoặc production.

## Cấu trúc thư mục

```text
api/
├── assets/
│   ├── document-templates/             # Mỗi thư mục chứa file.docx và preview.webp
│   │   ├── Báo truyền thống/
│   │   ├── Bản ghi nhớ có góc cạnh và đường cong/
│   │   ├── Bản ghi nhờ màu xanh lam/
│   │   ├── Tiêu đề vui vẻ/
│   │   └── Tờ bướm mời dự tiệc/
│   └── presentation-templates/         # Mỗi thư mục chứa file.pptx và preview.png
├── src/
│   ├── bootstrap/
│   │   └── api/
│   │       ├── app.module.ts
│   │       ├── create-api-app.ts
│   │       ├── main.ts
│   ├── http/
│   │   ├── filters/
│   │   │   ├── api-exception.filter.ts
│   │   │   └── api-exception.filter.spec.ts
│   │   └── interceptors/
│   │       ├── response-envelope.interceptor.ts
│   │       └── response-envelope.interceptor.spec.ts
│   ├── database/
│   │   ├── config/
│   │   │   ├── data-source.ts
│   │   │   └── database.options.ts
│   │   ├── seeds/
│   │   │   ├── office-template-samples.seed.ts
│   │   │   └── office-template-samples.seed.spec.ts
│   │   ├── entities/
│   │   │   ├── anonymous-workspace.entity.ts
│   │   │   ├── office-template.entity.ts
│   │   │   ├── office-template-version.entity.ts
│   │   │   ├── presentation-slide-preview.entity.ts
│   │   │   ├── stored-file.entity.ts
│   │   │   ├── template-category.entity.ts
│   │   │   └── user-document.entity.ts
│   │   ├── migrations/
│   │   │   ├── 1793376000000-create-office-template-schema.ts
│   │   │   ├── 1793380800000-add-anonymous-document-workspaces.ts
│   │   │   └── 1793384400000-add-presentation-slide-count.ts
│   │   └── enums/office-template.enums.ts
│   └── modules/
│       ├── health/
│       │   ├── presentation/controllers/health.controller.ts
│       │   └── health.module.ts
│       ├── document-template-library/
│       │   ├── application/
│       │   │   ├── contracts/              # Contract đọc mẫu, workspace, đọc/ghi tài liệu và storage
│       │   │   ├── errors/                 # Lỗi nghiệp vụ có HTTP status ổn định
│       │   │   ├── services/
│       │   │   │   ├── catalog/            # List/detail/preview, mỗi use case có folder riêng
│       │   │   │   ├── user-documents/     # Create/list/read/download/save/delete, mỗi use case có folder riêng
│       │   │   │   └── workspaces/         # Cấp và xác thực danh tính ẩn danh
│       │   │   ├── types/                  # Kiểu response nội bộ application
│       │   │   └── utils/                  # Projection metadata không lộ storage key
│       │   ├── infrastructure/
│       │   │   ├── repositories/
│       │   │   │   ├── mappers/            # Chuyển TypeORM entity sang application contract
│       │   │   │   ├── read/
│       │   │   │   │   ├── document-templates/ # Đọc catalog mẫu DOCX
│       │   │   │   │   └── user-documents/     # Đọc tài liệu người dùng
│       │   │   │   ├── workspaces/         # TypeORM adapter lưu token hash
│       │   │   │   └── write/user-documents/ # Transaction ghi và xóa tài liệu theo workflow
│       │   │   └── storage/local-document-file-storage.ts
│       │   ├── presentation/
│       │   │   ├── controllers/
│       │   │   │   ├── document-templates/
│       │   │   │   │   ├── list-document-templates/          # GET /document-templates
│       │   │   │   │   ├── list-document-template-categories/ # GET /document-templates/categories
│       │   │   │   │   ├── get-document-template/            # GET /document-templates/:templateId
│       │   │   │   │   ├── get-document-template-preview/   # GET /document-templates/:templateId/preview
│       │   │   │   │   └── create-user-document/            # POST /document-templates/:templateId/documents
│       │   │   │   └── user-documents/
│       │   │   │       ├── get-user-document/                # GET /user-documents/:documentId
│       │   │   │       ├── list-user-documents/               # GET /user-documents
│       │   │   │       ├── save-user-document-content/      # PUT /user-documents/:documentId/content
│       │   │   │       ├── download-user-document/          # GET /user-documents/:documentId/download
│       │   │   │       ├── delete-user-document/            # DELETE /user-documents/:documentId
│       │   │   │       └── onlyoffice/                      # Editor file và callback
│       │   │   ├── dto/                    # Validation cho request HTTP
│       │   │   ├── guards/                 # Nhận diện anonymous workspace từ HttpOnly cookie
│       │   │   └── types/uploaded-office-document-file.ts
│       │   └── document-template-library.module.ts
│       └── presentation-template-library/
│           ├── application/
│           │   ├── contracts/presentation-template-reader.contract.ts
│           │   ├── errors/
│           │   ├── services/catalog/              # Mỗi API đọc catalog có use case riêng
│           │   ├── services/user-presentations/   # Tạo bản PPTX riêng
│           │   └── types/                         # Read model và preview metadata
│           ├── infrastructure/repositories/read/presentation-templates/
│           ├── presentation/
│           │   ├── controllers/presentation-templates/ # Một controller cho mỗi API
│           │   └── dto/
│           └── presentation-template-library.module.ts
├── test/
│   └── jest-e2e.json
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

`bootstrap/api` giữ composition root, factory cấu hình Nest và entry point của process. `src/http` chứa filter và interceptor dùng chung toàn API; `create-api-app.ts` đăng ký chúng vào request lifecycle, còn mỗi spec nằm cạnh implementation. Ở hai feature DOCX và PPTX, controller/DTO thuộc `presentation`; contract, lỗi và use case thuộc `application`; TypeORM read repository thuộc `infrastructure`. Feature DOCX giữ thêm các adapter ghi tài liệu và storage dùng chung. Mỗi use case nằm trong folder riêng cạnh spec của nó. Asset nguồn bất biến nằm trong `assets/`; file đầu ra được lưu riêng ở `FILE_STORAGE_ROOT`. Các migration lần lượt tạo catalog, bổ sung workspace ẩn danh và trường số slide của phiên bản trình chiếu.

Mỗi file Jest mở đầu bằng bảng test case tiếng Việt, sau đó từng test ghi rõ bước Arrange, Act và Assert. Test service mock contract; test TypeORM repository mock query builder/transaction manager; test storage dùng thư mục tạm để kiểm tra bytes và path boundary.

Chạy unit test bằng `npm test -- --runInBand`; chạy coverage bằng `npm run test:cov -- --runInBand`.

## Mô hình dữ liệu

Sơ đồ thể hiện các bảng dự kiến cho hai thư viện mẫu. Các file DOCX, PPTX và ảnh được lưu ở storage; PostgreSQL chỉ lưu metadata cùng khóa tham chiếu tới file.

```mermaid
classDiagram
    direction TB

    class TEMPLATE_CATEGORIES:::category {
        id: UUID PK
        name: VARCHAR, max 120 chars
        slug: VARCHAR, max 140 chars, UNIQUE
        description: TEXT, nullable
        sort_order: INTEGER, default 0
        is_active: BOOLEAN, default true
        created_at: TIMESTAMPTZ
        updated_at: TIMESTAMPTZ
    }

    class OFFICE_TEMPLATES:::template {
        id: UUID PK
        product_type: ENUM document / presentation
        category_id: UUID FK
        name: VARCHAR, max 200 chars
        slug: VARCHAR, max 220 chars
        description: TEXT, nullable
        status: ENUM draft / published / archived
        is_featured: BOOLEAN, default false
        published_at: TIMESTAMPTZ, nullable
        created_at: TIMESTAMPTZ
        updated_at: TIMESTAMPTZ
        deleted_at: TIMESTAMPTZ, nullable
    }

    class OFFICE_TEMPLATE_VERSIONS:::version {
        id: UUID PK
        template_id: UUID FK
        version_number: INTEGER, positive
        slide_count: INTEGER, nullable, positive
        source_file_id: UUID FK
        thumbnail_file_id: UUID FK, nullable
        is_current: BOOLEAN, default false
        change_note: TEXT, nullable
        created_at: TIMESTAMPTZ
    }

    class PRESENTATION_SLIDE_PREVIEWS:::preview {
        id: UUID PK
        version_id: UUID FK
        slide_number: INTEGER, positive
        preview_file_id: UUID FK
        title: VARCHAR, max 200 chars, nullable
        created_at: TIMESTAMPTZ
    }

    class STORED_FILES:::file {
        id: UUID PK
        provider: ENUM local / s3
        storage_namespace: VARCHAR, max 120 chars
        object_key: TEXT
        original_filename: VARCHAR, max 255 chars, nullable
        mime_type: VARCHAR, max 160 chars
        size_bytes: BIGINT, nonnegative
        sha256: CHAR, 64 chars, nullable
        created_at: TIMESTAMPTZ
    }

    class USER_DOCUMENTS:::document {
        id: UUID PK
        anonymous_workspace_id: UUID FK, nullable for legacy documents
        source_template_version_id: UUID FK
        title: VARCHAR, max 200 chars
        status: ENUM provisioning / ready / failed
        output_file_id: UUID FK, nullable
        failure_code: VARCHAR, max 80 chars, nullable
        created_at: TIMESTAMPTZ
        updated_at: TIMESTAMPTZ
        deleted_at: TIMESTAMPTZ, nullable
    }

    class ANONYMOUS_WORKSPACES:::workspace {
        id: UUID PK
        token_hash: VARCHAR, 64 chars, UNIQUE
        created_at: TIMESTAMPTZ
        last_seen_at: TIMESTAMPTZ
        expires_at: TIMESTAMPTZ
    }

    TEMPLATE_CATEGORIES "1" --> "0..*" OFFICE_TEMPLATES : category_id
    OFFICE_TEMPLATES "1" --> "0..*" OFFICE_TEMPLATE_VERSIONS : template_id
    OFFICE_TEMPLATE_VERSIONS "1" --> "0..*" PRESENTATION_SLIDE_PREVIEWS : version_id
    OFFICE_TEMPLATE_VERSIONS "0..*" --> "1" STORED_FILES : source_file_id
    OFFICE_TEMPLATE_VERSIONS "0..*" --> "0..1" STORED_FILES : thumbnail_file_id
    PRESENTATION_SLIDE_PREVIEWS "0..*" --> "1" STORED_FILES : preview_file_id
    USER_DOCUMENTS "0..*" --> "1" OFFICE_TEMPLATE_VERSIONS : source_template_version_id
    USER_DOCUMENTS "0..*" --> "0..1" STORED_FILES : output_file_id
    ANONYMOUS_WORKSPACES "0..1" --> "0..*" USER_DOCUMENTS : anonymous_workspace_id

    classDef category fill:#ede9fe,stroke:#7c3aed,color:#2e1065,stroke-width:2px
    classDef template fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:2px
    classDef version fill:#cffafe,stroke:#0891b2,color:#164e63,stroke-width:2px
    classDef preview fill:#fce7f3,stroke:#db2777,color:#831843,stroke-width:2px
    classDef file fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:2px
    classDef document fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef workspace fill:#e0e7ff,stroke:#4f46e5,color:#312e81,stroke-width:2px
```

Mỗi khối là một bảng; field được viết theo dạng `tên_field: kiểu dữ liệu`, sau đó là khóa và ràng buộc như `PK`, `FK`, `UNIQUE`, `nullable`, `default` hoặc giới hạn độ dài. Cardinality ở hai đầu đường nối thể hiện số bản ghi có thể liên kết. `product_type` phân biệt mẫu văn bản và trình chiếu; danh mục có thể dùng chung. Tài liệu được tạo ghim vào phiên bản mẫu đã chọn và workspace thiết bị; workspace chỉ lưu hash token. `anonymous_workspace_id` nullable để xử lý tài liệu được tạo trước khi có cơ chế này. Ràng buộc còn gồm slug duy nhất theo loại mẫu, số phiên bản duy nhất trên mỗi mẫu, tối đa một phiên bản hiện hành trên mỗi mẫu, và số slide duy nhất trong mỗi phiên bản.

## Tính năng và trạng thái

| Hạng mục                                                 | Trạng thái                                  |
| -------------------------------------------------------- | ------------------------------------------- |
| NestJS bootstrap, CORS, validation và Swagger            | Đã triển khai                               |
| Health check                                             | Đã triển khai                               |
| Thư viện mẫu DOCX: tìm kiếm, lọc, phân trang và preview  | Đã triển khai                               |
| Tạo bản DOCX riêng và tải xuống                          | Đã triển khai                               |
| Workspace ẩn danh, giới hạn tài liệu theo trình duyệt    | Đã triển khai phía API                      |
| Danh sách tài liệu và mở lại tài liệu đã lưu             | Đã triển khai phía API                      |
| Lưu DOCX/PPTX qua callback ONLYOFFICE                    | Có luồng; cần xác nhận cấu hình Docs Server |
| Response envelope thành công và lỗi                      | Đã triển khai toàn API                      |
| Entity TypeORM cho mô hình dữ liệu                       | Đã triển khai                               |
| Kết nối PostgreSQL và migration                          | Đã triển khai                               |
| Chỉnh sửa nội dung bằng editor nhúng                     | Đã tích hợp; cần Docs Server hoạt động đúng |
| Thư viện mẫu PPTX: tìm kiếm, danh mục, detail và preview | Đã triển khai, có 9 bộ mẫu                  |
| Tạo, chỉnh sửa và tải bản PPTX độc lập                   | Đã triển khai qua workspace thiết bị        |
| Xóa tài liệu theo workspace                              | Đã triển khai                               |

ONLYOFFICE callback thay bản DOCX/PPTX hiện hành sau khi nhận callback lưu cuối `status: 2`; API cũng có `PUT /user-documents/:documentId/content` cho luồng upload trực tiếp. Bản cũ bị thay thế nên API hiện mở lại bản đã lưu gần nhất, chưa giữ lịch sử phiên bản. Người dùng chưa có tài khoản; cookie workspace giới hạn dữ liệu theo hồ sơ trình duyệt và không đồng bộ giữa máy.

## Lệnh phát triển

Chạy trong thư mục `api`:

| Lệnh                                  | Mục đích                                             |
| ------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                         | Chạy NestJS ở chế độ watch                           |
| `npm run build`                       | Build API và viết lại alias cho runtime              |
| `npm run start:prod`                  | Chạy ứng dụng đã build trong `dist/`                 |
| `npm run migration:show:dev`          | Xem migration đã áp dụng và còn chờ                  |
| `npm run seed:office-templates:dev`   | Seed catalog DOCX/PPTX theo cách idempotent          |
| `npm run database:reset-and-seed:dev` | Xóa dữ liệu nghiệp vụ local rồi seed lại hai catalog |
| `npm run migration:run:dev`           | Áp dụng migration lên PostgreSQL local               |
| `npm run migration:revert:dev`        | Hoàn tác migration mới nhất                          |
| `npm run type-check`                  | Kiểm tra kiểu TypeScript                             |
| `npm run lint`                        | Kiểm tra source bằng ESLint                          |

Tạo migration mới sau khi sửa entity bằng lệnh:

```powershell
npm run migration:generate:dev -- src/database/migrations/DescribeSchemaChange
```

Review migration đã sinh trước khi chạy `npm run migration:run:dev`. Không sửa migration đã áp dụng; tạo migration tiếp theo để thay đổi schema.

## Tích hợp frontend

Frontend hiện đặt `VITE_API_BASE_URL` mặc định là `http://localhost:3001/api`, nhưng chưa gửi request tới API. Khi kết nối được triển khai, hai danh mục sẽ được tải qua các endpoint tương ứng ở trên.

## Giấy phép

Package API đang được đánh dấu `UNLICENSED`; chưa có giấy phép sử dụng công khai.
