// Nhóm unit test cho OnlyOfficeDocsService: kiểm tra chữ ký JWT, cấu hình editor và tải DOCX an toàn.
// | STT | Test case                         | Mục đích                                      | Các bước làm                                                   | Kết quả mong đợi                                      |
// |-----|-----------------------------------|-----------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------|
// | 1   | Tạo editor config                 | Ký config và URL file theo cấu hình           | JWT ký hai payload; gọi createEditorConfig                    | URL, quyền, token và thời hạn ký chính xác            |
// | 2   | Thiếu cấu hình                    | Không ký khi thiếu biến môi trường            | Xóa JWT secret; gọi createEditorConfig                         | Ném ServiceUnavailableException                      |
// | 3   | URL cấu hình sai                  | Từ chối URL không hợp lệ                      | Đặt URL sai định dạng; gọi createEditorConfig                  | Ném ServiceUnavailableException                      |
// | 4   | Token file hợp lệ                 | Chấp nhận đúng document và revision           | Verifier trả claims khớp; gọi verifyDocumentFileToken          | Hoàn tất và xác minh bằng HS256                       |
// | 5   | Thiếu token file                  | Chặn truy cập không có token                  | Gọi verifyDocumentFileToken với token undefined                | Ném UnauthorizedException, không gọi verifier         |
// | 6   | Chữ ký token file sai             | Ẩn lỗi verifier khỏi HTTP boundary            | Verifier từ chối token; gọi verifyDocumentFileToken             | Ném UnauthorizedException                            |
// | 7   | Claims token file không khớp       | Chặn sai mục đích, document hoặc revision     | Verifier trả từng claims không khớp; gọi verify                | Ném UnauthorizedException                            |
// | 8   | Callback thiếu Bearer             | Chặn callback không có token                  | Gọi verifyCallback với header thiếu/sai                         | Ném UnauthorizedException, không gọi verifier         |
// | 9   | Callback hợp lệ                   | Xác thực token và body callback               | Verifier trả payload đã ký khớp; gọi verifyCallback            | Hoàn tất và chỉ xác minh phần token sau Bearer        |
// | 10  | Chữ ký callback sai               | Từ chối JWT callback không hợp lệ             | Verifier từ chối JWT; gọi verifyCallback                       | Ném UnauthorizedException                            |
// | 11  | Claims callback không khớp         | Chặn body bị sửa hoặc token sai operation     | Verifier trả claims không khớp body; gọi verifyCallback        | Ném UnauthorizedException                            |
// | 12  | URL tải public/internal           | Đổi đúng host và port Docker khi fetch         | Callback dùng port public; gọi downloadEditedDocument           | Giữ path/query, tải qua port nội bộ và ghép Buffer    |
// | 13  | URL tải không được phép           | Chặn URL sai protocol, origin hoặc credentials| Gọi downloadEditedDocument với URL không an toàn               | Ném BadGatewayException, không gọi fetch              |
// | 14  | Fetch thất bại                    | Chuẩn hóa lỗi kết nối Document Server         | Fetch reject; gọi downloadEditedDocument                       | Ném BadGatewayException                              |
// | 15  | Response không có file            | Từ chối HTTP lỗi hoặc body rỗng               | Fetch trả response lỗi/body null; gọi downloadEditedDocument   | Ném BadGatewayException                              |
// | 16  | Content-Length quá giới hạn       | Chặn file lớn trước khi đọc stream            | Header khai báo lớn hơn 25 MB; gọi downloadEditedDocument      | Ném PayloadTooLargeException                         |
// | 17  | Stream vượt giới hạn              | Chặn file lớn khi kích thước khai báo thiếu   | Reader trả chunk vượt 25 MB; gọi downloadEditedDocument        | Hủy reader và ném PayloadTooLargeException            |
// | 18  | Không đọc được stream             | Chuẩn hóa lỗi đọc nội dung                    | Reader reject; gọi downloadEditedDocument                      | Ném BadGatewayException và nhả reader lock            |

import {
    BadGatewayException,
    PayloadTooLargeException,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import type {
    OnlyOfficeCallbackPayload,
    OnlyOfficeCallbackTokenClaims,
    OnlyOfficeFileAccessClaims,
} from '@/integrations/onlyoffice/types/onlyoffice-docs.types';

const MAX_DOCX_SIZE_BYTES = 25 * 1024 * 1024;
const onlyOfficeEnvironmentKeys = [
    'ONLYOFFICE_JWT_SECRET',
    'ONLYOFFICE_PUBLIC_URL',
    'ONLYOFFICE_INTERNAL_URL',
    'ONLYOFFICE_API_INTERNAL_URL',
] as const;
const originalOnlyOfficeEnvironment = Object.fromEntries(
    onlyOfficeEnvironmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof onlyOfficeEnvironmentKeys)[number], string | undefined>;

// Khôi phục môi trường gốc để mỗi test độc lập và không làm rò cấu hình sang suite khác.
function restoreOnlyOfficeEnvironment(): void {
    for (const key of onlyOfficeEnvironmentKeys) {
        const originalValue = originalOnlyOfficeEnvironment[key];

        // Xóa biến vốn không tồn tại; các biến có sẵn được trả lại đúng giá trị trước suite.
        if (originalValue === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalValue;
        }
    }
}

// Tạo response stream nhỏ để kiểm tra ghép chunk mà không phụ thuộc máy chủ thật.
function createDownloadResponse(
    chunks: Uint8Array[],
    status = 200,
    headers: HeadersInit = {},
): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });

    return new Response(body, { status, headers });
}

describe('OnlyOfficeDocsService', () => {
    let target: OnlyOfficeDocsService;
    let mockJwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

    beforeEach(() => {
        process.env.ONLYOFFICE_JWT_SECRET = 'test-onlyoffice-secret';
        process.env.ONLYOFFICE_PUBLIC_URL = 'https://docs.example.test/';
        process.env.ONLYOFFICE_INTERNAL_URL = 'http://onlyoffice:8080/';
        process.env.ONLYOFFICE_API_INTERNAL_URL = 'http://api:3001/api/';
        mockJwtService = {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
        };
        target = new OnlyOfficeDocsService(
            mockJwtService as unknown as JwtService,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        restoreOnlyOfficeEnvironment();
    });

    // Test 1: URL file gắn token riêng, còn config được ký bằng cùng secret trong thời hạn ngắn hơn.
    it('should create an editor config with signed, encoded document URLs', async () => {
        // Bước 1 - Arrange: JWT service trả token riêng cho file và cấu hình editor.
        mockJwtService.signAsync
            .mockResolvedValueOnce('signed-file-token')
            .mockResolvedValueOnce('signed-editor-config');

        // Bước 2 - Act: tạo cấu hình cho document ID cần mã hóa an toàn trong URL path.
        const result = await target.createEditorConfig(
            'document/with space',
            'Báo cáo tháng',
            'revision-key',
        );

        // Bước 3 - Assert: giữ quyền DOCX, callback URL và thời hạn ký theo contract với Docs.
        expect(result).toEqual({
            apiScriptUrl:
                'https://docs.example.test/web-apps/apps/api/documents/api.js',
            config: {
                documentType: 'word',
                type: 'desktop',
                width: '100%',
                height: '100%',
                token: 'signed-editor-config',
                document: {
                    fileType: 'docx',
                    key: 'revision-key',
                    title: 'Báo cáo tháng.docx',
                    url: 'http://api:3001/api/user-documents/document%2Fwith%20space/editor-file?token=signed-file-token',
                    permissions: { edit: true, download: true, print: true },
                },
                editorConfig: {
                    customization: {},
                    callbackUrl:
                        'http://api:3001/api/user-documents/document%2Fwith%20space/onlyoffice-callback',
                    lang: 'vi',
                    mode: 'edit',
                    user: { id: 'office-template-user', name: 'Người dùng' },
                },
            },
        });
        expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
            1,
            {
                documentId: 'document/with space',
                key: 'revision-key',
                purpose: 'onlyoffice:document-download',
            },
            {
                secret: 'test-onlyoffice-secret',
                algorithm: 'HS256',
                expiresIn: '12h',
            },
        );
        expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
            2,
            {
                documentType: 'word',
                type: 'desktop',
                width: '100%',
                height: '100%',
                document: {
                    fileType: 'docx',
                    key: 'revision-key',
                    title: 'Báo cáo tháng.docx',
                    url: 'http://api:3001/api/user-documents/document%2Fwith%20space/editor-file?token=signed-file-token',
                    permissions: { edit: true, download: true, print: true },
                },
                editorConfig: {
                    customization: {},
                    callbackUrl:
                        'http://api:3001/api/user-documents/document%2Fwith%20space/onlyoffice-callback',
                    lang: 'vi',
                    mode: 'edit',
                    user: { id: 'office-template-user', name: 'Người dùng' },
                },
            },
            {
                secret: 'test-onlyoffice-secret',
                algorithm: 'HS256',
                expiresIn: '1h',
            },
        );
    });

    // Test 2: thiếu bất kỳ biến bắt buộc nào thì fail closed trước khi ký token.
    it('should reject editor config creation when required settings are missing', async () => {
        // Bước 1 - Arrange: giả lập môi trường thiếu secret dùng chung với Document Server.
        delete process.env.ONLYOFFICE_JWT_SECRET;

        // Bước 2 - Act và Bước 3 - Assert: báo cấu hình chưa sẵn sàng và không gọi JWT provider.
        await expect(
            target.createEditorConfig('document-1', 'Báo cáo', 'key-1'),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    // Test 3: URL sai định dạng bị phát hiện trước mọi thao tác ký.
    it('should reject malformed OnlyOffice URLs before signing', async () => {
        // Bước 1 - Arrange: URL nội bộ không parse được theo chuẩn URL.
        process.env.ONLYOFFICE_INTERNAL_URL = 'http://%invalid';

        // Bước 2 - Act và Bước 3 - Assert: trả lỗi cấu hình và giữ JWT provider chưa được gọi.
        await expect(
            target.createEditorConfig('document-1', 'Báo cáo', 'key-1'),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    // Test 4: token file hợp lệ phải được kiểm tra bằng secret đã trim và chỉ cho thuật toán HS256.
    it('should accept a file token bound to the expected document revision', async () => {
        // Bước 1 - Arrange: verifier trả claims khớp mục đích, document và revision.
        const claims: OnlyOfficeFileAccessClaims = {
            purpose: 'onlyoffice:document-download',
            documentId: 'document-1',
            key: 'revision-1',
        };
        mockJwtService.verifyAsync.mockResolvedValue(claims);

        // Bước 2 - Act: xác thực signed token trước khi cấp file cho editor.
        await expect(
            target.verifyDocumentFileToken(
                'signed-file-token',
                'document-1',
                'revision-1',
            ),
        ).resolves.toBeUndefined();

        // Bước 3 - Assert: verifier nhận đúng secret và danh sách thuật toán cho phép.
        expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
            'signed-file-token',
            {
                secret: 'test-onlyoffice-secret',
                algorithms: ['HS256'],
            },
        );
    });

    // Test 5: thiếu token phải bị chặn trước khi gọi verifier.
    it('should reject a missing file token without verifying it', async () => {
        // Bước 1 - Arrange: token đầu vào không được cung cấp.

        // Bước 2 - Act và Bước 3 - Assert: không có token thì không thể truy cập file editor.
        await expect(
            target.verifyDocumentFileToken(
                undefined,
                'document-1',
                'revision-1',
            ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    });

    // Test 6: lỗi chữ ký được chuyển thành lỗi xác thực chung, không lộ chi tiết JWT.
    it('should normalize file token verification failures', async () => {
        // Bước 1 - Arrange: provider từ chối token đã bị sửa hoặc hết hạn.
        mockJwtService.verifyAsync.mockRejectedValue(
            new Error('JWT signature mismatch'),
        );

        // Bước 2 - Act và Bước 3 - Assert: boundary nhận UnauthorizedException thay cho lỗi thư viện.
        await expect(
            target.verifyDocumentFileToken(
                'tampered-token',
                'document-1',
                'revision-1',
            ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // Test 7: cả purpose, document ID và revision đều phải khớp với tài liệu đang yêu cầu.
    it.each([
        [
            'purpose',
            {
                purpose: 'other-purpose',
                documentId: 'document-1',
                key: 'revision-1',
            },
        ],
        [
            'document id',
            {
                purpose: 'onlyoffice:document-download',
                documentId: 'document-2',
                key: 'revision-1',
            },
        ],
        [
            'revision key',
            {
                purpose: 'onlyoffice:document-download',
                documentId: 'document-1',
                key: 'revision-2',
            },
        ],
    ] as const)(
        'should reject a file token with a mismatched %s',
        async (_claimName, claims) => {
            // Bước 1 - Arrange: signature hợp lệ nhưng một claim không thuộc tài liệu hiện tại.
            mockJwtService.verifyAsync.mockResolvedValue(claims);

            // Bước 2 - Act và Bước 3 - Assert: claim mismatch không được phép cấp file.
            await expect(
                target.verifyDocumentFileToken(
                    'signed-file-token',
                    'document-1',
                    'revision-1',
                ),
            ).rejects.toBeInstanceOf(UnauthorizedException);
        },
    );

    // Test 8: chỉ header Bearer có token mới được đưa vào luồng xác minh callback.
    it.each([undefined, 'Basic callback-token', 'Bearer   '])(
        'should reject a callback without a valid Bearer token (%s)',
        async (authorizationHeader) => {
            // Bước 1 - Arrange: giả lập header vắng mặt hoặc không có token sau scheme.
            const body: OnlyOfficeCallbackPayload = { key: 'key-1', status: 2 };

            // Bước 2 - Act và Bước 3 - Assert: xác thực header trước khi gọi JWT provider.
            await expect(
                target.verifyCallback(authorizationHeader, body),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
        },
    );

    // Test 9: Bearer không phân biệt hoa thường, nhưng phần body phải khớp đầy đủ payload đã ký.
    it('should verify the signed callback payload from a case-insensitive Bearer header', async () => {
        // Bước 1 - Arrange: body và claims cùng chứa trạng thái cùng URL file đã lưu.
        const body: OnlyOfficeCallbackPayload = {
            key: 'revision-1',
            status: 2,
            url: 'http://onlyoffice:8080/cache/document.docx',
            filetype: 'docx',
        };
        const claims: OnlyOfficeCallbackTokenClaims = {
            operation: 'callback',
            payload: body,
        };
        mockJwtService.verifyAsync.mockResolvedValue(claims);

        // Bước 2 - Act: xác minh callback với scheme viết hoa/thường khác nhau.
        await expect(
            target.verifyCallback('bEaReR signed-callback-token', body),
        ).resolves.toBeUndefined();

        // Bước 3 - Assert: chỉ token được chuyển cho verifier và dùng secret/HS256 đã cấu hình.
        expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
            'signed-callback-token',
            {
                secret: 'test-onlyoffice-secret',
                algorithms: ['HS256'],
            },
        );
    });

    // Test 10: lỗi xác minh callback được chuẩn hóa thành lỗi không được phép.
    it('should normalize callback JWT verification failures', async () => {
        // Bước 1 - Arrange: JWT provider từ chối chữ ký callback.
        mockJwtService.verifyAsync.mockRejectedValue(new Error('JWT expired'));

        // Bước 2 - Act và Bước 3 - Assert: không lộ exception nội bộ ra HTTP boundary.
        await expect(
            target.verifyCallback('Bearer expired-token', {
                key: 'revision-1',
                status: 2,
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // Test 11: operation và toàn bộ trường trong body phải trùng claims đã ký.
    it.each([
        ['operation', { operation: 'other-operation' }],
        ['key', { payload: { key: 'revision-2', status: 2 } }],
        ['status', { payload: { key: 'revision-1', status: 3 } }],
        [
            'URL',
            {
                payload: {
                    key: 'revision-1',
                    status: 2,
                    url: 'http://onlyoffice:8080/other.docx',
                },
            },
        ],
        [
            'file type',
            {
                payload: {
                    key: 'revision-1',
                    status: 2,
                    filetype: 'xlsx',
                },
            },
        ],
        ['payload', { payload: undefined }],
    ] as const)(
        'should reject a callback with a mismatched signed %s',
        async (_claimName, overrides) => {
            // Bước 1 - Arrange: tạo claims hợp lệ làm nền rồi thay đúng trường đang kiểm tra.
            const body: OnlyOfficeCallbackPayload = {
                key: 'revision-1',
                status: 2,
                url: 'http://onlyoffice:8080/cache/document.docx',
                filetype: 'docx',
            };
            const claims: OnlyOfficeCallbackTokenClaims = {
                operation: 'callback',
                payload: body,
                ...overrides,
            };
            mockJwtService.verifyAsync.mockResolvedValue(claims);

            // Bước 2 - Act và Bước 3 - Assert: body khác payload đã ký phải bị từ chối.
            await expect(
                target.verifyCallback('Bearer signed-token', body),
            ).rejects.toBeInstanceOf(UnauthorizedException);
        },
    );

    // Test 12: chỉ origin cấu hình được tải, response stream được ghép nguyên thứ tự và không theo redirect.
    it.each([
        [
            'internal',
            'http://onlyoffice:8080/cache/result.docx',
            'http://onlyoffice:8080/cache/result.docx',
        ],
        [
            'public',
            'https://docs.example.test/cache/result.docx?md5=signed-value',
            'http://onlyoffice:8080/cache/result.docx?md5=signed-value',
        ],
    ])(
        'should download a DOCX from the configured %s origin using a reachable URL',
        async (_originName, fileUrl, expectedFetchUrl) => {
            // Bước 1 - Arrange: Document Server trả file thành nhiều chunk.
            const firstChunk = Buffer.from('docx-part-1');
            const secondChunk = Buffer.from('-part-2');
            const response = createDownloadResponse([firstChunk, secondChunk]);
            const fetchMock = jest
                .spyOn(globalThis, 'fetch')
                .mockResolvedValue(response);

            // Bước 2 - Act: URL callback public phải được chuyển sang origin nội bộ trước khi gọi fetch.
            const result = await target.downloadEditedDocument(fileUrl);

            // Bước 3 - Assert: giữ path/query, trả nguyên bytes và không tự theo redirect.
            expect(result).toEqual(Buffer.concat([firstChunk, secondChunk]));
            expect(fetchMock.mock.calls[0]?.[0]).toEqual(
                new URL(expectedFetchUrl),
            );
            expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
            expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(
                AbortSignal,
            );
        },
    );

    // Test 12 bổ sung: bỏ port publish 8082 và dùng port 80 bên trong Docker khi chuyển URL public.
    it('should replace the published Docs Server port with the internal Docker port', async () => {
        // Bước 1 - Arrange: browser URL dùng host port 8082, còn API nối tới service port 80.
        process.env.ONLYOFFICE_PUBLIC_URL = 'http://localhost:8082';
        process.env.ONLYOFFICE_INTERNAL_URL = 'http://onlyoffice:80';
        const response = createDownloadResponse([Buffer.from('saved-docx')]);
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(response);

        // Bước 2 - Act: tải URL callback có cùng origin public và query chữ ký.
        const result = await target.downloadEditedDocument(
            'http://localhost:8082/cache/result.docx?md5=signed-value',
        );

        // Bước 3 - Assert: fetch dùng hostname/port container, giữ nguyên path/query và bytes.
        expect(fetchMock.mock.calls[0]?.[0]).toEqual(
            new URL('http://onlyoffice/cache/result.docx?md5=signed-value'),
        );
        expect(result).toEqual(Buffer.from('saved-docx'));
    });

    // Test 13: URL sai, ngoài origin, protocol hoặc có credentials đều bị chặn trước network call.
    it.each([
        'not-a-valid-url',
        'https://untrusted.example.test/cache/result.docx',
        'file:///tmp/result.docx',
        'http://user:password@onlyoffice:8080/cache/result.docx',
    ])('should reject an unsafe OnlyOffice file URL: %s', async (fileUrl) => {
        // Bước 1 - Arrange: spy để chứng minh URL bị từ chối trước khi gọi network.
        const fetchMock = jest.spyOn(globalThis, 'fetch');

        // Bước 2 - Act và Bước 3 - Assert: không gửi request tới đích không nằm trong allowlist.
        await expect(
            target.downloadEditedDocument(fileUrl),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Test 14: lỗi kết nối được bọc thành BadGateway để caller không phụ thuộc lỗi fetch cụ thể.
    it('should normalize network failures while downloading the edited file', async () => {
        // Bước 1 - Arrange: fetch báo lỗi kết nối Document Server.
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(
            new Error('connection refused'),
        );

        // Bước 2 - Act và Bước 3 - Assert: trả lỗi gateway thay vì để lộ lỗi transport.
        await expect(
            target.downloadEditedDocument(
                'http://onlyoffice:8080/cache/result.docx',
            ),
        ).rejects.toBeInstanceOf(BadGatewayException);
    });

    // Test 15: response lỗi HTTP hoặc thiếu body không được coi là file DOCX hợp lệ.
    it.each([
        ['redirect response', new Response(null, { status: 302 })],
        ['missing body', new Response(null, { status: 200 })],
    ])(
        'should reject an OnlyOffice response with %s',
        async (_caseName, response) => {
            // Bước 1 - Arrange: Document Server không trả response thành công có body.
            jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

            // Bước 2 - Act và Bước 3 - Assert: không tạo Buffer rỗng từ response không hợp lệ.
            await expect(
                target.downloadEditedDocument(
                    'http://onlyoffice:8080/cache/result.docx',
                ),
            ).rejects.toBeInstanceOf(BadGatewayException);
        },
    );

    // Test 16: content-length vượt 25 MB bị chặn trước khi service đọc stream.
    it('should reject a file whose declared size exceeds the DOCX limit', async () => {
        // Bước 1 - Arrange: response khai báo kích thước lớn hơn giới hạn cho phép.
        const response = createDownloadResponse([Buffer.from('unused')], 200, {
            'content-length': String(MAX_DOCX_SIZE_BYTES + 1),
        });
        const body = response.body;
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

        // Bước 2 - Act và Bước 3 - Assert: trả lỗi kích thước và không khóa stream để đọc.
        await expect(
            target.downloadEditedDocument(
                'http://onlyoffice:8080/cache/result.docx',
            ),
        ).rejects.toBeInstanceOf(PayloadTooLargeException);
        expect(body?.locked).toBe(false);
    });

    // Test 17: stream cũng được giới hạn khi server không khai báo kích thước trước.
    it('should cancel a stream that exceeds the DOCX limit while reading', async () => {
        // Bước 1 - Arrange: reader phát chunk vượt giới hạn và cho phép kiểm tra cancel/release.
        const reader = {
            read: jest.fn().mockResolvedValue({
                done: false,
                value: { byteLength: MAX_DOCX_SIZE_BYTES + 1 },
            }),
            cancel: jest.fn().mockResolvedValue(undefined),
            releaseLock: jest.fn(),
        };
        const response = {
            ok: true,
            body: { getReader: () => reader },
            headers: new Headers(),
        } as unknown as Response;
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

        // Bước 2 - Act và Bước 3 - Assert: hủy phần còn lại ngay khi vượt giới hạn rồi nhả lock.
        await expect(
            target.downloadEditedDocument(
                'http://onlyoffice:8080/cache/result.docx',
            ),
        ).rejects.toBeInstanceOf(PayloadTooLargeException);
        expect(reader.cancel).toHaveBeenCalledTimes(1);
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    });

    // Test 18: lỗi đọc stream được chuẩn hóa và reader luôn được nhả trong finally.
    it('should release the stream reader when reading the DOCX fails', async () => {
        // Bước 1 - Arrange: reader lỗi trong lúc lấy chunk sau khi response đã được chấp nhận.
        const reader = {
            read: jest.fn().mockRejectedValue(new Error('stream interrupted')),
            cancel: jest.fn(),
            releaseLock: jest.fn(),
        };
        const response = {
            ok: true,
            body: { getReader: () => reader },
            headers: new Headers(),
        } as unknown as Response;
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

        // Bước 2 - Act và Bước 3 - Assert: lỗi đọc thành gateway error, dù nhánh đọc bị reject.
        await expect(
            target.downloadEditedDocument(
                'http://onlyoffice:8080/cache/result.docx',
            ),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    });
});
