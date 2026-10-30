# === BƯỚC 1 === 
# Chuẩn bị dependency đầy đủ cho quá trình biên dịch.
# Stage này có cả devDependencies vì Nest CLI và TypeScript cần chúng để build.
FROM node:22-alpine AS dependencies

# Dùng một thư mục cố định để mọi stage tham chiếu cùng đường dẫn trong container.
WORKDIR /app

# Chép manifest trước mã nguồn để Docker tái sử dụng layer cài package khi code đổi.
COPY package.json package-lock.json ./

# Cài đúng phiên bản trong package-lock.json, tránh dependency trôi giữa các lần build.
RUN npm ci

# === BƯỚC 2 ===
# Biên dịch source TypeScript thành JavaScript chạy được bằng Node.js.
# Kế thừa dependency của bước 1 để dùng Nest CLI, TypeScript và compiler trong lúc build.
FROM dependencies AS build

# Đưa source và cấu hình build vào image; .dockerignore loại node_modules và .env.
COPY . .

# Build Nest, sau đó viết lại alias @/ để import trong dist chạy được ở production.
RUN npm run build

# === BƯỚC 3 ===
# Cài dependency cần thiết khi chạy ứng dụng.
# Tạo stage sạch để không mang compiler, test runner và công cụ phát triển sang runtime.
FROM node:22-alpine AS production-dependencies
WORKDIR /app

# Chỉ cần manifest để xác định production dependency; source không được cài vào stage này.
COPY package.json package-lock.json ./

# Bỏ devDependencies và cache npm khỏi layer kết quả để giảm kích thước image cuối.
RUN npm ci --omit=dev && npm cache clean --force

# === BƯỚC 4 ===
# Đóng gói image runtime tối giản và khởi chạy API.
# Image cuối bắt đầu từ Node Alpine mới, không kế thừa source hoặc tooling của bước build.
FROM node:22-alpine AS runtime

# Báo cho Nest và thư viện liên quan biết ứng dụng đang chạy ở môi trường production.
ENV NODE_ENV=production
WORKDIR /app

# Sao chép package chạy thật; gán quyền cho user node để không cần chạy bằng root.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules

# Chỉ đưa JavaScript đã biên dịch vào image chạy, không đưa TypeScript source.
COPY --from=build --chown=node:node /app/dist ./dist

# Đưa asset DOCX/PPTX cùng ảnh preview WebP vào image.
# Seed và preview dùng cùng bộ asset trong container.
COPY --from=build --chown=node:node /app/assets ./assets

# Giữ package metadata để Node phân giải module theo cấu hình của package.
COPY --from=build --chown=node:node /app/package.json ./package.json

# Chuẩn bị thư mục đầu ra cho named volume và gán quyền trước khi hạ quyền sang user node.
RUN mkdir -p /app/storage && chown node:node /app/storage

# Chạy tiến trình bằng user ít quyền hơn nhằm giảm quyền của ứng dụng trong container.
USER node

# Khai báo cổng API bên trong container; docker-compose quyết định cổng publish ra host.
EXPOSE 3001

# Lệnh mặc định khởi chạy bootstrap HTTP API khi container bắt đầu.
CMD ["node", "dist/bootstrap/api/main.js"]
