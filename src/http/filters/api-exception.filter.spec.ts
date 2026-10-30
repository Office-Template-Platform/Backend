// Nhóm unit test cho ApiExceptionFilter: kiểm tra HTTP errors, Multer errors và ẩn lỗi nội bộ.
// | STT | Test case               | Mục đích                            | Các bước làm                         | Kết quả mong đợi                           |
// |-----|-------------------------|-------------------------------------|--------------------------------------|--------------------------------------------|
// | 1   | HTTP 400 với array      | Giữ status và validation messages   | Gửi BadRequestException               | Envelope code/message/meta đúng             |
// | 2   | HTTP string response    | Hỗ trợ exception trả string          | Gửi HttpException(string, 409)        | Giữ nguyên message và status               |
// | 3   | File vượt giới hạn      | Chuẩn hóa lỗi Multer 413             | Gửi LIMIT_FILE_SIZE                   | PAYLOAD_TOO_LARGE, status 413              |
// | 4   | Multipart sai           | Chuẩn hóa lỗi upload 400              | Gửi MulterError khác                  | INVALID_MULTIPART, status 400              |
// | 5   | Lỗi không biết          | Không lộ exception/stack cho client  | Gửi Error nội bộ                      | HTTP 500 với message an toàn                |
import {
    ArgumentsHost,
    BadRequestException,
    HttpException,
    HttpStatus,
    Logger,
    Response,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiExceptionFilter } from '@/http/filters/api-exception.filter';

type ApiErrorEnvelope = {
    success: false;
    error: {
        statusCode: number;
        code: string;
        message: string | string[];
    };
    meta: {
        timestamp: string;
        path: string;
        method: string;
    };
};

type MockResponse = {
    status: jest.Mock<MockResponse, [statusCode: number]>;
    json: jest.Mock<MockResponse, [body: unknown]>;
};

describe('ApiExceptionFilter', () => {
    let target: ApiExceptionFilter;
    let mockResponse: MockResponse;
    let mockHost: ArgumentsHost;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        target = new ApiExceptionFilter();
        mockResponse = {
            status: jest.fn<MockResponse, [number]>(),
            json: jest.fn<MockResponse, [unknown]>(),
        };
        mockResponse.status.mockReturnValue(mockResponse);
        mockResponse.json.mockReturnValue(mockResponse);
        mockHost = {
            switchToHttp: () => ({
                getRequest: () =>
                    ({ path: '/api/user-documents', method: 'PUT' }) as Request,
                getResponse: () => mockResponse as unknown as Response,
            }),
        } as ArgumentsHost;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    // Test 1 giữ status 400 và toàn bộ danh sách validation message của Nest.
    it('should format HTTP validation errors with their original status', () => {
        // Bước 1 - Arrange: lỗi validation chứa nhiều thông báo field.
        const exception = new BadRequestException([
            'page must be an integer',
            'limit must not exceed 100',
        ]);

        // Bước 2 - Act: gửi exception qua global filter.
        target.catch(exception, mockHost);

        // Bước 3 - Assert: status, code, messages và metadata request nhất quán.
        expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.BAD_REQUEST,
        );
        const responseBody = mockResponse.json.mock
            .calls[0]?.[0] as ApiErrorEnvelope;
        expect(responseBody).toMatchObject({
            success: false,
            error: {
                statusCode: 400,
                code: 'BadRequestException',
                message: [
                    'page must be an integer',
                    'limit must not exceed 100',
                ],
            },
            meta: { path: '/api/user-documents', method: 'PUT' },
        });
        expect(Number.isNaN(Date.parse(responseBody.meta.timestamp))).toBe(
            false,
        );
    });

    // Test 2 hỗ trợ HttpException trả message string và giữ nguyên HTTP conflict status.
    it('should preserve string messages and non-default HTTP status', () => {
        // Bước 1 - Arrange: tạo lỗi conflict có response dạng string.
        const exception = new HttpException(
            'Document is not ready',
            HttpStatus.CONFLICT,
        );

        // Bước 2 - Act: lọc exception.
        target.catch(exception, mockHost);

        // Bước 3 - Assert: giữ message/status và dùng class name làm error code.
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(mockResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: {
                    statusCode: 409,
                    code: 'HttpException',
                    message: 'Document is not ready',
                },
            }),
        );
    });

    // Test 3 nhận diện Multer LIMIT_FILE_SIZE để phân biệt payload quá lớn với lỗi multipart chung.
    it('should map a Multer file size error to HTTP 413', () => {
        // Bước 1 - Arrange: Multer phát lỗi kích thước file vượt 25 MiB.
        const exception = Object.assign(new Error('Unexpected field'), {
            name: 'MulterError',
            code: 'LIMIT_FILE_SIZE',
        });

        // Bước 2 - Act: chuẩn hóa upload exception.
        target.catch(exception, mockHost);

        // Bước 3 - Assert: client nhận status và mã lỗi payload quá lớn.
        expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.PAYLOAD_TOO_LARGE,
        );
        expect(mockResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: {
                    statusCode: 413,
                    code: 'PAYLOAD_TOO_LARGE',
                    message: 'File DOCX không được vượt quá 25 MB.',
                },
            }),
        );
    });

    // Test 4 lỗi multipart khác trả 400 để client sửa request thay vì thử lại như lỗi server.
    it('should map other Multer errors to a safe HTTP 400 response', () => {
        // Bước 1 - Arrange: Multer phát lỗi field multipart không hợp lệ.
        const exception = Object.assign(new Error('Unexpected field'), {
            name: 'MulterError',
            code: 'LIMIT_UNEXPECTED_FILE',
        });

        // Bước 2 - Act: lọc lỗi multipart.
        target.catch(exception, mockHost);

        // Bước 3 - Assert: nội dung Multer không bị lộ, status là 400.
        expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.BAD_REQUEST,
        );
        expect(mockResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: {
                    statusCode: 400,
                    code: 'INVALID_MULTIPART',
                    message: 'Dữ liệu tải lên không hợp lệ.',
                },
            }),
        );
    });

    // Test 5 lỗi không dự kiến trả message an toàn thay vì SQL, stack hoặc đường dẫn file.
    it('should hide unknown exception details behind a safe HTTP 500 response', () => {
        // Bước 1 - Arrange: lỗi server chứa nội dung nhạy cảm giả lập.
        const exception = new Error('postgres password and private path');

        // Bước 2 - Act: exception không được nhận diện đi qua filter.
        target.catch(exception, mockHost);

        // Bước 3 - Assert: HTTP 500 có thông báo chung và không chứa lỗi nội bộ.
        expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const responseBody = mockResponse.json.mock
            .calls[0]?.[0] as ApiErrorEnvelope;
        expect(responseBody).toEqual(
            expect.objectContaining({
                success: false,
                error: {
                    statusCode: 500,
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Đã xảy ra lỗi hệ thống.',
                },
            }),
        );
        expect(responseBody.error.message).toBe('Đã xảy ra lỗi hệ thống.');
    });
});
