// Nhóm unit test cho seed database: xác nhận reset chỉ chạy trên PostgreSQL local ở development và chỉ xóa dữ liệu nghiệp vụ.
// | STT | Test case                  | Mục đích                               | Các bước làm                                                           | Kết quả mong đợi                          |
// |-----|----------------------------|----------------------------------------|------------------------------------------------------------------------|-------------------------------------------|
// | 1   | Development và localhost   | Cho phép reset an toàn                 | NODE_ENV=development, DB_HOST=localhost; gọi assertLocalResetIsAllowed | Không ném lỗi                             |
// | 2   | Database từ xa             | Ngăn xóa nhầm database dùng chung      | DB_HOST là hostname bên ngoài; gọi guard reset                         | Ném lỗi bảo vệ trước khi kết nối          |
// | 3   | Ngoài development          | Chặn reset ở môi trường khác           | NODE_ENV=production, DB_HOST=localhost; gọi guard reset                | Ném lỗi bảo vệ                            |
// | 4   | Truncate dữ liệu nghiệp vụ | Giữ nguyên schema và lịch sử migration | Gọi resetApplicationData với EntityManager giả                         | Chạy một TRUNCATE đúng sáu bảng nghiệp vụ |
// | 5   | Manifest PPTX              | Chỉ seed bộ có đủ file nguồn và preview| Kiểm tra số mẫu, slide count và hai asset trên đĩa                     | 9 bộ hợp lệ, asset đều tồn tại             |

import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EntityManager } from 'typeorm';
import {
    assertLocalResetIsAllowed,
    presentationTemplates,
    resetApplicationData,
} from '@/database/seeds/office-template-samples.seed';

describe('office-template-samples.seed', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 chỉ cho phép reset khi ứng dụng chạy development với PostgreSQL local.
    it('should allow reset when development uses a local database host', () => {
        // Bước 1 - Arrange: cung cấp môi trường local mà lệnh reset hỗ trợ.
        const environment = {
            NODE_ENV: 'development',
            DB_HOST: 'localhost',
        } as NodeJS.ProcessEnv;

        // Bước 2 - Act và Assert: cấu hình an toàn được chấp nhận.
        expect(() => assertLocalResetIsAllowed(environment)).not.toThrow();
    });

    // Test 2 chặn host từ xa để tránh xóa nhầm database dùng chung hoặc cloud.
    it('should reject reset when the database host is remote', () => {
        // Bước 1 - Arrange: môi trường development nhưng host không phải loopback.
        const environment = {
            NODE_ENV: 'development',
            DB_HOST: 'postgres.example.com',
        } as NodeJS.ProcessEnv;

        // Bước 2 - Act và Assert: reset bị từ chối trước khi mở kết nối database.
        expect(() => assertLocalResetIsAllowed(environment)).toThrow(
            'Reset database chỉ được phép trong development với DB_HOST là localhost hoặc loopback.',
        );
    });

    // Test 3 chặn reset khi NODE_ENV không phải development dù database nằm trên máy local.
    it('should reject reset outside the development environment', () => {
        // Bước 1 - Arrange: host local nhưng ứng dụng được đánh dấu production.
        const environment = {
            NODE_ENV: 'production',
            DB_HOST: 'localhost',
        } as NodeJS.ProcessEnv;

        // Bước 2 - Act và Assert: môi trường production không được phép xóa dữ liệu.
        expect(() => assertLocalResetIsAllowed(environment)).toThrow(
            'Reset database chỉ được phép trong development với DB_HOST là localhost hoặc loopback.',
        );
    });

    // Test 4 bảo đảm reset chỉ truncate bảng nghiệp vụ, không đụng lịch sử migration.
    it('should truncate application tables and preserve migration history', async () => {
        // Bước 1 - Arrange: giả lập EntityManager để không kết nối PostgreSQL thật.
        const mockQuery = jest.fn().mockResolvedValue(undefined);
        const manager = { query: mockQuery } as unknown as EntityManager;

        // Bước 2 - Act: yêu cầu helper xóa dữ liệu bảng nghiệp vụ.
        await resetApplicationData(manager);

        // Bước 3 - Assert: một câu lệnh xóa đúng sáu bảng, không xóa bảng migration.
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(
            'TRUNCATE TABLE public."presentation_slide_previews", public."user_documents", public."office_template_versions", public."office_templates", public."template_categories", public."stored_files" RESTART IDENTITY CASCADE',
        );
    });

    // Test 5 bảo đảm danh sách PPTX phản ánh đúng chín bộ hoàn chỉnh có file nguồn và ảnh PNG.
    it('should include only complete PPTX assets with verified slide counts', async () => {
        // Bước 1 - Arrange: khai báo số slide đã đối chiếu trực tiếp với từng file PPTX.
        const expectedSlideCounts = {
            'ban-trinh-bay-pho-bien': 14,
            'chung-chi-dao-tao': 1,
            'chung-nhan-hoc-bong': 1,
            'giai-thuong-nhan-vien-xuat-sac-wave-border': 1,
            'giay-chung-nhan-nhan-vien-cua-thang': 1,
            'sach-nho-quang-cao-mau-vang': 4,
            'so-do-to-chuc-don-gian': 1,
            'thiet-ke-giot-nuoc': 14,
            'thiet-ke-may-tinh-bang': 2,
        };

        // Bước 2 - Act: kiểm tra cả asset nguồn và preview cho từng mẫu đã đăng ký.
        const assetChecks = await Promise.all(
            presentationTemplates.map(async (template) => {
                await access(
                    resolve(process.cwd(), 'assets', template.sourceKey),
                );
                await access(
                    resolve(process.cwd(), 'assets', template.previewKey),
                );
                return [template.slug, template.slideCount] as const;
            }),
        );

        // Bước 3 - Assert: không thiếu asset, không lặp slug và slide count khớp manifest.
        expect(presentationTemplates).toHaveLength(9);
        expect(
            new Set(presentationTemplates.map(({ slug }) => slug)).size,
        ).toBe(presentationTemplates.length);
        expect(Object.fromEntries(assetChecks)).toEqual(expectedSlideCounts);
    });
});
