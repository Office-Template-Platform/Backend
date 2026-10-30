// Nhóm unit test cho seed database: kiểm tra reset chỉ chạy trên local development và giữ migration.
// | STT | Test case                 | Mục đích                         | Các bước làm                        | Kết quả mong đợi                              |
// |-----|---------------------------|----------------------------------|-------------------------------------|-----------------------------------------------|
// | 1   | Host local, development   | Cho phép reset môi trường an toàn| Truyền NODE_ENV và DB_HOST hợp lệ   | Không ném lỗi                                 |
// | 2   | Host từ xa                | Chặn xóa nhầm database dùng chung| Truyền host không phải loopback     | Ném lỗi bảo vệ                                |
// | 3   | Môi trường production     | Chặn reset production            | Truyền NODE_ENV production         | Ném lỗi bảo vệ                                |
// | 4   | Reset bảng nghiệp vụ      | Xóa dữ liệu nhưng giữ migration  | Gọi helper với query mock          | TRUNCATE đúng sáu bảng, không gồm bảng migration |
import type { EntityManager } from 'typeorm';
import {
    assertLocalResetIsAllowed,
    resetApplicationData,
} from '@/database/seeds/document-template-samples.seed';

describe('document-template-samples.seed', () => {
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
});
