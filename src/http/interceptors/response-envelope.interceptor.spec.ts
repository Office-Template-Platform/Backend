// Nhóm unit test cho ResponseEnvelopeInterceptor: kiểm tra JSON envelope, metadata request và binary passthrough.
// | STT | Test case          | Mục đích                          | Các bước làm                          | Kết quả mong đợi                         |
// |-----|--------------------|-----------------------------------|---------------------------------------|------------------------------------------|
// | 1   | JSON thành công    | Bọc data và request metadata       | Handler trả object                    | success/data/meta đúng                    |
// | 2   | Giá trị nullish    | Chuẩn hóa kết quả rỗng             | Handler trả undefined                 | data là null                              |
// | 3   | StreamableFile     | Giữ nguyên response nhị phân       | Handler trả cùng StreamableFile       | Trả cùng instance, không có envelope       |
// | 4   | Handler lỗi        | Để exception đi tới filter         | Handler observable reject             | Promise reject cùng lỗi gốc               |
import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import type { Request } from 'express';
import {
    ResponseEnvelopeInterceptor,
    type ApiSuccessResponse,
} from '@/http/interceptors/response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
    let target: ResponseEnvelopeInterceptor;
    let mockContext: ExecutionContext;

    beforeEach(() => {
        target = new ResponseEnvelopeInterceptor();
        mockContext = {
            switchToHttp: () => ({
                getRequest: () =>
                    ({
                        path: '/api/document-templates',
                        method: 'GET',
                    }) as Request,
            }),
        } as ExecutionContext;
    });

    // Test 1 xác nhận toàn bộ response JSON có data và metadata theo HTTP request.
    it('should wrap a successful JSON result with request metadata', async () => {
        // Bước 1 - Arrange: controller trả object JSON thông thường.
        const responseData = { items: [{ id: 'template-1' }], total: 1 };
        const mockHandler: CallHandler = { handle: () => of(responseData) };

        // Bước 2 - Act: chạy interceptor trên HTTP context.
        const result = await firstValueFrom(
            target.intercept(mockContext, mockHandler),
        );

        // Bước 3 - Assert: envelope có success/data/path/method và timestamp ISO hợp lệ.
        const successResponse = result as ApiSuccessResponse<unknown>;
        expect(successResponse).toMatchObject({
            success: true,
            data: responseData,
            meta: {
                path: '/api/document-templates',
                method: 'GET',
            },
        });
        expect(Number.isNaN(Date.parse(successResponse.meta.timestamp))).toBe(
            false,
        );
    });

    // Test 2 biến undefined thành null để client luôn nhận data key ổn định.
    it('should normalize an undefined handler result to null data', async () => {
        // Bước 1 - Arrange: handler không trả body.
        const mockHandler: CallHandler = { handle: () => of(undefined) };

        // Bước 2 - Act: chuyển observable thành kết quả để assert.
        const result = await firstValueFrom(
            target.intercept(mockContext, mockHandler),
        );

        // Bước 3 - Assert: response vẫn có success và data null.
        const successResponse = result as ApiSuccessResponse<unknown>;
        expect(successResponse).toMatchObject({
            success: true,
            data: null,
            meta: {
                path: '/api/document-templates',
                method: 'GET',
            },
        });
    });

    // Test 3 bảo đảm binary body không bị đổi thành JSON envelope làm hỏng DOCX/ảnh.
    it('should pass StreamableFile through without wrapping it', async () => {
        // Bước 1 - Arrange: handler trả file stream với MIME gốc.
        const streamableFile = new StreamableFile(Buffer.from('binary bytes'), {
            type: 'application/octet-stream',
        });
        const mockHandler: CallHandler = {
            handle: () => of(streamableFile),
        };

        // Bước 2 - Act: nhận response từ interceptor.
        const result = await firstValueFrom(
            target.intercept(mockContext, mockHandler),
        );

        // Bước 3 - Assert: cùng instance StreamableFile được chuyển tiếp.
        expect(result).toBe(streamableFile);
        expect(result).toBeInstanceOf(StreamableFile);
    });

    // Test 4 lỗi controller không được biến thành success response ở interceptor.
    it('should propagate handler errors to the global exception filter', async () => {
        // Bước 1 - Arrange: use case reject với lỗi HTTP đã phân loại.
        const failure = new Error('request failed');
        const mockHandler: CallHandler = {
            handle: () => throwError(() => failure),
        };

        // Bước 2 - Act và Bước 3 - Assert: observable giữ nguyên exception.
        await expect(
            lastValueFrom(target.intercept(mockContext, mockHandler)),
        ).rejects.toBe(failure);
    });
});
