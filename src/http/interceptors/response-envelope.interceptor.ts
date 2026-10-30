// Chuẩn hóa response JSON thành một hợp đồng thống nhất cho toàn bộ HTTP API.
// StreamableFile được giữ nguyên để endpoint tải DOCX và ảnh không bị bọc thành JSON.
import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

export type ApiSuccessResponse<T> = {
    success: true;
    data: T;
    meta: {
        timestamp: string;
        path: string;
        method: string;
    };
};

// Bọc response thành công sau khi controller hoàn tất; lỗi HTTP tiếp tục qua exception flow của Nest.
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor<
    unknown,
    ApiSuccessResponse<unknown> | StreamableFile
> {
    // Gắn metadata theo request hiện tại và không sửa response nhị phân dùng để xem hoặc tải file.
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<ApiSuccessResponse<unknown> | StreamableFile> {
        const request = context.switchToHttp().getRequest<Request>();

        return next.handle().pipe(
            map((data: unknown) => {
                // StreamableFile phải đi thẳng tới adapter HTTP để giữ Content-Type và luồng byte.
                if (data instanceof StreamableFile) {
                    return data;
                }

                return {
                    success: true,
                    data: data ?? null,
                    meta: {
                        timestamp: new Date().toISOString(),
                        path: request.path,
                        method: request.method,
                    },
                };
            }),
        );
    }
}
