// Chuẩn hóa lỗi HTTP thành envelope thống nhất và ẩn exception ngoài dự kiến khỏi client.
import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type HttpExceptionPayload = {
    message?: unknown;
};

type MultipartException = {
    code?: unknown;
    name?: unknown;
};

@Injectable()
@Catch()
// Filter giữ status HTTP, chuẩn hóa lỗi đã biết và ẩn chi tiết exception nội bộ.
export class ApiExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiExceptionFilter.name);

    // Giữ nguyên HTTP status, làm sạch lỗi ngoài dự kiến và luôn trả cùng cấu trúc JSON lỗi.
    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp();
        const request = context.getRequest<Request>();
        const response = context.getResponse<Response>();
        const isHttpException = exception instanceof HttpException;
        const isMultipartException =
            typeof exception === 'object' &&
            exception !== null &&
            (exception as MultipartException).name === 'MulterError';
        const isFileTooLarge =
            isMultipartException &&
            (exception as MultipartException).code === 'LIMIT_FILE_SIZE';
        // Giữ lỗi framework, chuyển lỗi multipart sang 400/413 và không biến lỗi client thành 500.
        const statusCode = isHttpException
            ? exception.getStatus()
            : isFileTooLarge
              ? HttpStatus.PAYLOAD_TOO_LARGE
              : isMultipartException
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;
        const exceptionPayload = isHttpException
            ? exception.getResponse()
            : null;
        const payload =
            typeof exceptionPayload === 'object' && exceptionPayload !== null
                ? (exceptionPayload as HttpExceptionPayload)
                : null;
        const rawMessage =
            typeof exceptionPayload === 'string'
                ? exceptionPayload
                : payload?.message;

        // ValidationPipe có thể trả danh sách lỗi; giữ danh sách trong message để client chỉ cần một schema.
        const message =
            typeof rawMessage === 'string' || Array.isArray(rawMessage)
                ? rawMessage
                : isHttpException
                  ? exception.message
                  : isFileTooLarge
                    ? 'File DOCX không được vượt quá 25 MB.'
                    : isMultipartException
                      ? 'Dữ liệu tải lên không hợp lệ.'
                      : 'Đã xảy ra lỗi hệ thống.';

        // Không ghi 4xx vào error log; exception không nhận diện được cần stack để truy nguyên server.
        if (!isHttpException && !isMultipartException) {
            this.logger.error(
                'Unhandled API exception.',
                exception instanceof Error ? exception.stack : undefined,
            );
        }

        response.status(statusCode).json({
            success: false,
            error: {
                statusCode,
                code: isHttpException
                    ? exception.name
                    : isFileTooLarge
                      ? 'PAYLOAD_TOO_LARGE'
                      : isMultipartException
                        ? 'INVALID_MULTIPART'
                        : 'INTERNAL_SERVER_ERROR',
                message,
            },
            meta: {
                timestamp: new Date().toISOString(),
                path: request.path,
                method: request.method,
            },
        });
    }
}
