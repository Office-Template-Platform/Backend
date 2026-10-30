// Nhóm unit test cho OnlyOfficeDocumentController: kiểm tra editor endpoints, file stream và contract callback.
// | STT | Test case             | Mục đích                                   | Các bước làm                                                 | Kết quả mong đợi                                          |
// |-----|-----------------------|--------------------------------------------|--------------------------------------------------------------|-----------------------------------------------------------|
// | 1   | Lấy editor config     | Chuyển document ID tới use case            | Gọi endpoint; config service trả cấu hình                    | Trả nguyên config và gọi đúng ID                          |
// | 2   | Lấy file editor       | Stream file inline với tên Unicode an toàn | Use case trả file; storage mở stream; gọi controller         | StreamableFile có đúng MIME, disposition và token         |
// | 3   | Callback thành công   | ACK theo contract ONLYOFFICE               | Callback service hoàn tất; response nhận status/json         | Trả HTTP 200 với body thuần { error: 0 }                  |
// | 4   | Callback lỗi HTTP     | Giữ status của lỗi nghiệp vụ               | Callback service ném HttpException 401; gọi controller      | Trả HTTP 401 với body thuần { error: 1 }                  |
// | 5   | Callback lỗi bất ngờ  | Ghi nhận lỗi server để truy nguyên 500      | Callback service ném Error thường; gọi controller           | Trả { error: 1 } và log stack không chứa JWT              |

import { HttpException, Logger, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { GetUserDocumentEditorConfigService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-config/get-user-document-editor-config.service';
import { GetUserDocumentEditorFileService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-file/get-user-document-editor-file.service';
import { HandleOnlyOfficeCallbackService } from '@/modules/document-template-library/application/services/user-documents/handle-onlyoffice-callback/handle-onlyoffice-callback.service';
import { OnlyOfficeDocumentController } from '@/modules/document-template-library/presentation/controllers/user-documents/onlyoffice/onlyoffice-document.controller';
import type { Response } from 'express';
import type {
    OnlyOfficeCallbackPayload,
    OnlyOfficeEditorConfigResponse,
} from '@/integrations/onlyoffice/types/onlyoffice-docs.types';

const documentId = '00000000-0000-4000-8000-000000000001';
const docxMimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const editorFile: StoredFileReference = {
    provider: 'local',
    storageNamespace: 'user-documents',
    objectKey: 'documents/document-1.docx',
    originalFilename: 'Résumé final.docx',
    mimeType: docxMimeType,
    sizeBytes: '512',
    sha256: 'file-checksum',
};
const editorConfig: OnlyOfficeEditorConfigResponse = {
    apiScriptUrl: 'http://localhost:8082/web-apps/apps/api/documents/api.js',
    config: {
        documentType: 'word',
        type: 'desktop',
        width: '100%',
        height: '100%',
        token: 'signed-editor-config',
        document: {
            fileType: 'docx',
            key: 'revision-key',
            title: 'Résumé final.docx',
            url: 'http://localhost:3001/api/user-documents/document-1/editor-file?token=signed-file-token',
            permissions: { edit: true, download: true, print: true },
        },
        editorConfig: {
            customization: {},
            callbackUrl:
                'http://localhost:3001/api/user-documents/document-1/onlyoffice-callback',
            lang: 'vi',
            mode: 'edit',
            user: { id: 'office-template-user', name: 'Người dùng' },
        },
    },
};
const callbackPayload: OnlyOfficeCallbackPayload = {
    key: 'revision-key',
    status: 2,
    url: 'http://onlyoffice:8080/cache/document.docx',
    filetype: 'docx',
};

describe('OnlyOfficeDocumentController', () => {
    let target: OnlyOfficeDocumentController;
    let mockGetEditorConfig: jest.Mocked<
        Pick<GetUserDocumentEditorConfigService, 'execute'>
    >;
    let mockGetEditorFile: jest.Mocked<
        Pick<GetUserDocumentEditorFileService, 'execute'>
    >;
    let mockHandleOnlyOfficeCallback: jest.Mocked<
        Pick<HandleOnlyOfficeCallbackService, 'execute'>
    >;
    let mockFileStorage: jest.Mocked<DocumentFileStorageContract>;
    let mockErrorLogger: jest.SpyInstance;

    // Cô lập logger để test lỗi callback không in stack trace ra Jest output.
    beforeEach(() => {
        mockErrorLogger = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        mockGetEditorConfig = { execute: jest.fn() };
        mockGetEditorFile = { execute: jest.fn() };
        mockHandleOnlyOfficeCallback = { execute: jest.fn() };
        mockFileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        target = new OnlyOfficeDocumentController(
            mockGetEditorConfig as unknown as GetUserDocumentEditorConfigService,
            mockGetEditorFile as unknown as GetUserDocumentEditorFileService,
            mockHandleOnlyOfficeCallback as unknown as HandleOnlyOfficeCallbackService,
            mockFileStorage,
        );
    });

    // Khôi phục logger và reset lịch sử mock để mỗi test chỉ thấy hành vi của chính nó.
    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    // Test 1: editor config được ủy quyền cho use case để controller không tự tạo JWT hay quyền truy cập.
    it('should return the editor configuration for the requested document', async () => {
        // Bước 1 - Arrange: use case trả config đã ký cho document đang mở.
        mockGetEditorConfig.execute.mockResolvedValue(editorConfig);

        // Bước 2 - Act: gọi endpoint GET /user-documents/:documentId/editor-config.
        const result = await target.getEditorConfiguration(
            documentId,
            'workspace-1',
        );

        // Bước 3 - Assert: controller trả nguyên config và chỉ chuyển đúng document ID.
        expect(result).toEqual(editorConfig);
        expect(mockGetEditorConfig.execute.mock.calls).toEqual([
            [documentId, 'workspace-1'],
        ]);
    });

    // Test 2: file chỉ được mở sau use case xác minh token; response stream hiển thị inline với tên UTF-8.
    it('should stream the verified editor file inline with an encoded filename', async () => {
        // Bước 1 - Arrange: use case xác minh token và storage trả stream cho DOCX hiện hành.
        const stream = Readable.from([Buffer.from('docx bytes')]);
        mockGetEditorFile.execute.mockResolvedValue({
            file: editorFile,
            filename: 'Résumé final.docx',
        });
        mockFileStorage.openReadStream.mockResolvedValue(stream);

        // Bước 2 - Act: gọi endpoint editor-file cùng token đã ký.
        const result = await target.getEditorDocument(
            documentId,
            'signed-file-token',
        );

        // Bước 3 - Assert: stream đúng file, MIME và Content-Disposition inline.
        expect(result).toBeInstanceOf(StreamableFile);
        expect(result.getStream()).toBe(stream);
        expect(result.getHeaders()).toEqual({
            type: docxMimeType,
            disposition:
                'inline; filename="document.docx"; filename*=UTF-8\'\'R%C3%A9sum%C3%A9%20final.docx',
        });
        expect(mockGetEditorFile.execute.mock.calls).toEqual([
            [documentId, 'signed-file-token'],
        ]);
        expect(mockFileStorage.openReadStream.mock.calls).toEqual([
            [editorFile],
        ]);
    });

    // Test 3: callback thành công phải trả JSON thuần để Document Server nhận ACK error: 0.
    it('should acknowledge a successfully processed OnlyOffice callback', async () => {
        // Bước 1 - Arrange: callback use case hoàn tất và response mock hỗ trợ status chain.
        const authorizationHeader = 'Bearer signed-callback-token';
        const mockResponse = {
            status: jest.fn(),
            json: jest.fn(),
        };
        mockResponse.status.mockReturnValue(mockResponse);
        mockHandleOnlyOfficeCallback.execute.mockResolvedValue(undefined);

        // Bước 2 - Act: chuyển nguyên auth header và payload tới callback use case.
        await target.receiveOnlyOfficeCallback(
            documentId,
            authorizationHeader,
            callbackPayload,
            mockResponse as unknown as Response,
        );

        // Bước 3 - Assert: callback nhận ACK 200 thuần, không qua response envelope.
        expect(mockHandleOnlyOfficeCallback.execute.mock.calls).toEqual([
            [documentId, authorizationHeader, callbackPayload],
        ]);
        expect(mockResponse.status.mock.calls).toEqual([[200]]);
        expect(mockResponse.json.mock.calls).toEqual([[{ error: 0 }]]);
    });

    // Test 4: lỗi HTTP từ xác thực hoặc nghiệp vụ giữ nguyên status để ONLYOFFICE biết request đã thất bại.
    it('should return the HTTP status and error ACK when callback processing throws an HttpException', async () => {
        // Bước 1 - Arrange: use case từ chối JWT callback bằng HTTP 401.
        const failure = new HttpException('Invalid callback token', 401);
        const mockResponse = {
            status: jest.fn(),
            json: jest.fn(),
        };
        mockResponse.status.mockReturnValue(mockResponse);
        mockHandleOnlyOfficeCallback.execute.mockRejectedValue(failure);

        // Bước 2 - Act: xử lý callback bị từ chối.
        await target.receiveOnlyOfficeCallback(
            documentId,
            'Bearer invalid-token',
            callbackPayload,
            mockResponse as unknown as Response,
        );

        // Bước 3 - Assert: response giữ status 401 nhưng body chỉ chứa error: 1.
        expect(mockResponse.status.mock.calls).toEqual([[401]]);
        expect(mockResponse.json.mock.calls).toEqual([[{ error: 1 }]]);
    });

    // Test 5: exception không thuộc HTTP được chuẩn hóa thành 500 thay vì làm callback request treo.
    it('should return HTTP 500 and an error ACK for unexpected callback failures', async () => {
        // Bước 1 - Arrange: use case phát sinh lỗi không có HTTP status.
        const failure = new Error('unexpected storage failure');
        const mockResponse = {
            status: jest.fn(),
            json: jest.fn(),
        };
        mockResponse.status.mockReturnValue(mockResponse);
        mockHandleOnlyOfficeCallback.execute.mockRejectedValue(failure);

        // Bước 2 - Act: controller bắt lỗi bất ngờ tại HTTP boundary.
        await target.receiveOnlyOfficeCallback(
            documentId,
            'Bearer signed-callback-token',
            callbackPayload,
            mockResponse as unknown as Response,
        );

        // Bước 3 - Assert: caller nhận 500 cùng callback ACK lỗi theo contract.
        expect(mockResponse.status.mock.calls).toEqual([[500]]);
        expect(mockResponse.json.mock.calls).toEqual([[{ error: 1 }]]);
        expect(mockErrorLogger).toHaveBeenCalledWith(
            `Lỗi xử lý callback ONLYOFFICE cho tài liệu ${documentId}.`,
            expect.stringContaining(failure.message),
        );
    });
});
