// Tạo cấu hình editor, ký URL tải file và xác minh giao tiếp với Document Server.
import {
    BadGatewayException,
    Injectable,
    PayloadTooLargeException,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
    OnlyOfficeCallbackPayload,
    OnlyOfficeCallbackTokenClaims,
    OnlyOfficeDocumentEditorConfig,
    OnlyOfficeEditorConfigResponse,
    OnlyOfficeFileAccessClaims,
} from '@/integrations/onlyoffice/types/onlyoffice-docs.types';
import type { OfficeDocumentExtension } from '@/modules/document-file-storage/application/types/office-document-format/office-document-format';

const MAX_EDITED_OFFICE_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Injectable()
// Adapter ứng dụng cho ONLYOFFICE Docs; giữ secret, URL mạng và định dạng JWT ở backend.
export class OnlyOfficeDocsService {
    constructor(private readonly jwtService: JwtService) {}

    // Bước 1 đọc cấu hình; thiếu URL hoặc JWT secret thì dừng trước khi phát hành token.
    // Bước 2 ký URL tải file Office theo documentId và revision key, sau đó ghép vào editor config.
    // Bước 3 ký toàn bộ config với thời hạn ngắn hơn; trình duyệt chỉ nhận public script URL và config đã ký.
    // File URL và callback URL dùng API internal URL để Document Server trong Docker gọi được backend.
    async createEditorConfig(
        documentId: string,
        title: string,
        key: string,
        fileType: OfficeDocumentExtension = 'docx',
    ): Promise<OnlyOfficeEditorConfigResponse> {
        // Bước 1: chuẩn hóa và kiểm tra các URL/secret cần cho cả token lẫn callback.
        const settings = this.getSettings();

        // Bước 2: token file chỉ dùng để tải đúng tài liệu, đúng revision và không dùng được cho mục đích khác.
        const fileToken = await this.jwtService.signAsync(
            {
                documentId,
                key,
                purpose: 'onlyoffice:document-download',
            },
            {
                secret: settings.jwtSecret,
                algorithm: 'HS256',
                expiresIn: '12h',
            },
        );

        // Bước 3: encode ID trong path và đặt token ở query để Document Server tải file qua API nội bộ.
        const documentUrl = new URL(
            `user-documents/${encodeURIComponent(documentId)}/editor-file`,
            `${settings.apiInternalUrl}/`,
        );
        documentUrl.searchParams.set('token', fileToken);

        // Bước 4: chọn editor Word/Slide đúng file type; callback quay về backend nội bộ.
        const unsignedConfig: Omit<OnlyOfficeDocumentEditorConfig, 'token'> = {
            documentType: fileType === 'pptx' ? 'slide' : 'word',
            type: 'desktop',
            width: '100%',
            height: '100%',
            document: {
                fileType,
                key,
                title: `${title}.${fileType}`,
                url: documentUrl.toString(),
                permissions: {
                    edit: true,
                    download: true,
                    print: true,
                },
            },
            editorConfig: {
                // Docs Server v10 đọc customization.font khi khởi tạo, nên luôn gửi object mặc định.
                customization: {},
                callbackUrl: new URL(
                    `user-documents/${encodeURIComponent(documentId)}/onlyoffice-callback`,
                    `${settings.apiInternalUrl}/`,
                ).toString(),
                lang: 'vi',
                mode: 'edit',
                user: {
                    id: 'office-template-user',
                    name: 'Người dùng',
                },
            },
        };

        // Bước 5: chữ ký của cấu hình có TTL ngắn hơn token tải file để giới hạn thời gian khởi tạo editor.
        const token = await this.jwtService.signAsync(unsignedConfig, {
            secret: settings.jwtSecret,
            algorithm: 'HS256',
            expiresIn: '1h',
        });

        // Bước 6: frontend tải script bằng URL public; URLs gọi từ Document Server vẫn nằm trong config nội bộ.
        return {
            apiScriptUrl: `${settings.publicUrl}/web-apps/apps/api/documents/api.js`,
            config: { ...unsignedConfig, token },
        };
    }

    // Bước 1 từ chối request không có token trước khi gọi JWT verifier.
    // Bước 2 xác minh chữ ký HS256 bằng secret dùng chung với ONLYOFFICE; mọi lỗi chữ ký/TTL thành 401 ổn định.
    // Bước 3 ràng buộc purpose, documentId và revision key để token không thể dùng cho file khác hoặc bản khác.
    async verifyDocumentFileToken(
        token: string | undefined,
        documentId: string,
        key: string,
    ): Promise<void> {
        // Không chấp nhận token vắng mặt; endpoint file không dựa vào cookie workspace của trình duyệt.
        if (!token) {
            throw new UnauthorizedException(
                'Thiếu token truy cập file editor.',
            );
        }

        // JWT lỗi, hết hạn hoặc ký sai được quy về cùng phản hồi để không lộ chi tiết xác minh.
        let claims: OnlyOfficeFileAccessClaims;
        try {
            claims =
                await this.jwtService.verifyAsync<OnlyOfficeFileAccessClaims>(
                    token,
                    {
                        secret: this.getSettings().jwtSecret,
                        algorithms: ['HS256'],
                    },
                );
        } catch {
            throw new UnauthorizedException(
                'Token truy cập file không hợp lệ.',
            );
        }

        // Chữ ký hợp lệ vẫn chưa đủ: token phải khớp cả mục đích, tài liệu và revision từ request hiện tại.
        if (
            claims.purpose !== 'onlyoffice:document-download' ||
            claims.documentId !== documentId ||
            claims.key !== key
        ) {
            throw new UnauthorizedException('Token không thuộc tài liệu này.');
        }
    }

    // Bước 1 chỉ nhận Bearer token trong Authorization và trim giá trị trước khi xác minh.
    // Bước 2 kiểm tra chữ ký/TTL bằng secret ONLYOFFICE; JWT lỗi được trả thành 401 mà không lộ lý do nội bộ.
    // Bước 3 so các claim nghiệp vụ được handler sử dụng với body để chặn callback giả hoặc payload bị sửa.
    async verifyCallback(
        authorizationHeader: string | undefined,
        body: OnlyOfficeCallbackPayload,
    ): Promise<void> {
        // Tách Bearer không phân biệt hoa thường và trim token để header rỗng/khoảng trắng bị từ chối.
        const token = authorizationHeader
            ?.match(/^Bearer\s+(.+)$/i)?.[1]
            ?.trim();
        if (!token) {
            throw new UnauthorizedException(
                'Callback thiếu JWT của ONLYOFFICE.',
            );
        }

        // Chỉ sau khi có token mới xác minh chữ ký; không tiếp tục xử lý body từ request chưa được tin cậy.
        let claims: OnlyOfficeCallbackTokenClaims;
        try {
            claims =
                await this.jwtService.verifyAsync<OnlyOfficeCallbackTokenClaims>(
                    token,
                    {
                        secret: this.getSettings().jwtSecret,
                        algorithms: ['HS256'],
                    },
                );
        } catch {
            throw new UnauthorizedException('JWT callback không hợp lệ.');
        }

        // Callback token phải khai báo đúng operation và ký trùng key/status/url/filetype với body nhận được.
        const signedPayload = claims.payload;
        if (
            claims.operation !== 'callback' ||
            !signedPayload ||
            signedPayload.key !== body.key ||
            signedPayload.status !== body.status ||
            signedPayload.url !== body.url ||
            signedPayload.filetype !== body.filetype
        ) {
            throw new UnauthorizedException(
                'Body callback không khớp payload JWT của ONLYOFFICE.',
            );
        }
    }

    // Bước 1 parse URL và kiểm tra protocol, origin allowlist, userinfo trước khi tạo request mạng.
    // Bước 2 gọi trực tiếp không theo redirect và có timeout để URL chuyển hướng không vượt allowlist.
    // Bước 3 chặn file quá lớn bằng Content-Length nếu có, đồng thời kiểm tra lại từng chunk khi stream.
    // Lỗi upstream được chuẩn hóa thành 502; file Office vượt giới hạn vẫn giữ 413.
    async downloadEditedDocument(fileUrl: string): Promise<Buffer> {
        const settings = this.getSettings();
        let target: URL;

        // URL không parse được là lỗi từ upstream ONLYOFFICE, không phải lỗi request người dùng.
        try {
            target = new URL(fileUrl);
        } catch {
            throw new BadGatewayException(
                'ONLYOFFICE trả về URL file không hợp lệ.',
            );
        }

        // So sánh chính xác origin public/internal để ONLYOFFICE không thể khiến API tải URL tùy ý.
        const allowedOrigins = new Set([
            new URL(settings.internalUrl).origin,
            new URL(settings.publicUrl).origin,
        ]);
        // Từ chối protocol lạ, origin ngoài cấu hình và URL có credentials trước khi fetch.
        if (
            !['http:', 'https:'].includes(target.protocol) ||
            !allowedOrigins.has(target.origin) ||
            target.username ||
            target.password
        ) {
            throw new BadGatewayException(
                'ONLYOFFICE trả về URL ngoài Document Server đã cấu hình.',
            );
        }

        // Manual redirect giữ nguyên ranh giới allowlist; timeout giới hạn thời gian chờ dịch vụ ngoài.
        let response: Response;
        try {
            response = await fetch(target, {
                signal: AbortSignal.timeout(30_000),
                redirect: 'manual',
            });
        } catch {
            throw new BadGatewayException(
                'Không kết nối được tới file kết quả của ONLYOFFICE.',
            );
        }

        // Chỉ đọc response thành công có body; response lỗi không được chuyển tiếp nội dung upstream cho client.
        if (!response.ok || !response.body) {
            throw new BadGatewayException(
                'ONLYOFFICE không cung cấp được file đã lưu.',
            );
        }

        // Content-Length cho phép từ chối sớm; stream vẫn cần giới hạn riêng vì header có thể thiếu hoặc sai.
        const declaredSize = Number(response.headers.get('content-length'));
        if (
            Number.isFinite(declaredSize) &&
            declaredSize > MAX_EDITED_OFFICE_FILE_SIZE_BYTES
        ) {
            throw new PayloadTooLargeException(
                'File sau chỉnh sửa vượt quá 25 MB.',
            );
        }

        // Đọc theo chunk và chỉ giữ dữ liệu sau khi kiểm tra tổng byte để tránh cấp phát vượt giới hạn 25 MB.
        const reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let totalSize = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                totalSize += value.byteLength;
                // Hủy stream ngay khi vượt ngưỡng để không tiếp tục tải hoặc giữ thêm dữ liệu trong bộ nhớ.
                if (totalSize > MAX_EDITED_OFFICE_FILE_SIZE_BYTES) {
                    await reader.cancel();
                    throw new PayloadTooLargeException(
                        'File sau chỉnh sửa vượt quá 25 MB.',
                    );
                }

                chunks.push(Buffer.from(value));
            }
        } catch (error) {
            // Giữ lỗi 413 đã chủ động tạo; lỗi đọc stream khác được chuyển thành lỗi upstream tổng quát.
            if (error instanceof PayloadTooLargeException) throw error;
            throw new BadGatewayException(
                'Không đọc được nội dung file từ ONLYOFFICE.',
            );
        } finally {
            // Nhả lock trong cả trường hợp đọc xong, vượt dung lượng hoặc stream bị lỗi.
            reader.releaseLock();
        }

        // Ghép đúng tổng byte đã đếm; caller nhận file Office hoàn chỉnh để lưu như một revision mới.
        return Buffer.concat(chunks, totalSize);
    }

    // Bước 1 lấy cấu hình tại thời điểm mở editor để các API catalog vẫn chạy khi ONLYOFFICE chưa được bật.
    // Bước 2 từ chối cấu hình thiếu hoặc URL sai cú pháp bằng lỗi 503 ổn định.
    // Bước 3 bỏ dấu slash cuối để ghép endpoint nhất quán, rồi chỉ trả settings cho service sử dụng nội bộ.
    private getSettings() {
        // Đọc trực tiếp từ environment ở mỗi lần dùng để thay đổi cấu hình không cần tạo client mới.
        const jwtSecret = process.env.ONLYOFFICE_JWT_SECRET?.trim();
        const publicUrl = process.env.ONLYOFFICE_PUBLIC_URL?.trim();
        const internalUrl = process.env.ONLYOFFICE_INTERNAL_URL?.trim();
        const apiInternalUrl = process.env.ONLYOFFICE_API_INTERNAL_URL?.trim();

        // Thiếu bất kỳ đầu mối kết nối nào thì không ký config có URL không thể truy cập.
        if (!jwtSecret || !publicUrl || !internalUrl || !apiInternalUrl) {
            throw new ServiceUnavailableException(
                'ONLYOFFICE Docs chưa được cấu hình cho API này.',
            );
        }

        // Kiểm tra cú pháp URL trước khi các phương thức dùng chúng để tạo endpoint hoặc allowlist origin.
        try {
            new URL(publicUrl);
            new URL(internalUrl);
            new URL(apiInternalUrl);
        } catch {
            throw new ServiceUnavailableException(
                'URL cấu hình ONLYOFFICE Docs không hợp lệ.',
            );
        }

        // Bỏ slash cuối để URL ghép bằng new URL không tạo path kép hoặc thay đổi base path bất ngờ.
        return {
            jwtSecret,
            publicUrl: publicUrl.replace(/\/+$/, ''),
            internalUrl: internalUrl.replace(/\/+$/, ''),
            apiInternalUrl: apiInternalUrl.replace(/\/+$/, ''),
        };
    }
}
