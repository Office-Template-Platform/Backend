// Nhóm unit test cho GetUserDocumentEditorConfigService: xác nhận config ONLYOFFICE gắn với revision hiện tại và chỉ tạo khi tài liệu sẵn sàng.
// | STT | Test case         | Mục đích                             | Các bước làm                                 | Kết quả mong đợi                                      |
// |-----|-------------------|--------------------------------------|----------------------------------------------|-------------------------------------------------------|
// | 1   | Tài liệu READY    | Tạo config có key theo revision file | Reader trả READY có output; gọi docs service | Config có key ổn định theo checksum/revision hiện tại |
// | 2   | Không tìm thấy    | Không tạo config cho ID lạ           | Reader trả null; gọi execute                 | Ném not-found và không gọi docs service               |
// | 3   | Thiếu output file | Chặn mở editor khi chưa có file      | Reader trả READY nhưng outputFile=null       | Ném UserDocumentNotReadyError                         |
// | 4   | Reader lỗi        | Không gọi editor khi đọc dữ liệu lỗi | Reader reject; gọi execute                   | Lỗi gốc được truyền lên, docs service không chạy      |
// | 5   | Tài liệu PPTX     | Chọn Slide Editor cho PowerPoint      | Reader trả READY/PPTX; gọi execute             | Docs service nhận extension pptx                  |

import { createHash } from 'node:crypto';
import type { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import type { OnlyOfficeEditorConfigResponse } from '@/integrations/onlyoffice/types/onlyoffice-docs.types';
import type { UserDocumentReaderContract } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { GetUserDocumentEditorConfigService } from '@/modules/document-template-library/application/services/user-documents/get-user-document-editor-config/get-user-document-editor-config.service';

const documentRecord: UserDocumentRecord = {
    id: 'document-1',
    title: 'Báo cáo tháng',
    status: 'ready',
    failureCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    downloadUrl: '/api/user-documents/document-1/download',
    outputFile: {
        provider: 'local',
        storageNamespace: 'user-documents',
        objectKey: 'documents/document-1.docx',
        originalFilename: 'Báo cáo tháng.docx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: '512',
        sha256: 'file-checksum',
    },
    sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 3 },
};

const editorConfigResponse: OnlyOfficeEditorConfigResponse = {
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
            title: 'Báo cáo tháng.docx',
            url: 'http://localhost:3001/api/user-documents/document-1/editor-file',
            permissions: { edit: true, download: true, print: true },
        },
        editorConfig: {
            customization: {},
            callbackUrl:
                'http://localhost:3001/api/user-documents/document-1/onlyoffice-callback',
            lang: 'vi',
            mode: 'edit',
            user: { id: 'user-1', name: 'Người dùng' },
        },
    },
};

describe('GetUserDocumentEditorConfigService', () => {
    let target: GetUserDocumentEditorConfigService;
    let mockFindUserDocumentByIdForWorkspace: jest.Mock<
        ReturnType<
            UserDocumentReaderContract['findUserDocumentByIdForWorkspace']
        >,
        Parameters<
            UserDocumentReaderContract['findUserDocumentByIdForWorkspace']
        >
    >;
    let mockCreateEditorConfig: jest.Mock<
        ReturnType<OnlyOfficeDocsService['createEditorConfig']>,
        Parameters<OnlyOfficeDocsService['createEditorConfig']>
    >;

    // Dùng chữ ký Jest tường minh để các helper mock không bị ESLint suy luận thành any.
    beforeEach(() => {
        mockFindUserDocumentByIdForWorkspace = jest.fn<
            ReturnType<
                UserDocumentReaderContract['findUserDocumentByIdForWorkspace']
            >,
            Parameters<
                UserDocumentReaderContract['findUserDocumentByIdForWorkspace']
            >
        >();
        mockCreateEditorConfig = jest.fn<
            ReturnType<OnlyOfficeDocsService['createEditorConfig']>,
            Parameters<OnlyOfficeDocsService['createEditorConfig']>
        >();
        target = new GetUserDocumentEditorConfigService(
            {
                findUserDocumentByIdForWorkspace:
                    mockFindUserDocumentByIdForWorkspace,
            },
            {
                createEditorConfig: mockCreateEditorConfig,
            } as unknown as OnlyOfficeDocsService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1: cấu hình chỉ được ký cho file READY và key phải đổi theo object revision.
    it('should create editor config with a key derived from the current file revision', async () => {
        // Bước 1 - Arrange: reader trả bản sao READY và ONLYOFFICE trả cấu hình đã ký.
        const expectedKey = createHash('sha256')
            .update(
                `${documentRecord.id}:${documentRecord.outputFile?.storageNamespace}:${documentRecord.outputFile?.objectKey}`,
            )
            .digest('hex');
        mockFindUserDocumentByIdForWorkspace.mockResolvedValue(documentRecord);
        mockCreateEditorConfig.mockResolvedValue(editorConfigResponse);

        // Bước 2 - Act: lấy editor config cho tài liệu người dùng.
        const result = await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: trả đúng payload và ký đúng document, title, revision key.
        expect(result).toEqual(editorConfigResponse);
        expect(mockFindUserDocumentByIdForWorkspace.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
        expect(mockCreateEditorConfig.mock.calls).toEqual([
            ['document-1', 'Báo cáo tháng', expectedKey, 'docx'],
        ]);
    });

    // Test 2: id không tồn tại dừng trước khi yêu cầu ONLYOFFICE ký cấu hình.
    it('should throw not found when the user document does not exist', async () => {
        // Bước 1 - Arrange: reader không tìm thấy id.
        mockFindUserDocumentByIdForWorkspace.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: báo lỗi 404 và không phát sinh cấu hình editor.
        await expect(
            target.execute('missing-document', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockCreateEditorConfig.mock.calls).toEqual([]);
    });

    // Test 3: các trạng thái chưa READY đều bị từ chối trước khi tạo URL có quyền tải file.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state',
        async (status) => {
            // Bước 1 - Arrange: document tồn tại nhưng đang ở trạng thái không cho mở editor.
            mockFindUserDocumentByIdForWorkspace.mockResolvedValue({
                ...documentRecord,
                status,
                outputFile: null,
            });

            // Bước 2 - Act và Bước 3 - Assert: giữ semantics 409 và không gọi ONLYOFFICE.
            await expect(
                target.execute('document-1', 'workspace-1'),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
            expect(mockCreateEditorConfig.mock.calls).toEqual([]);
        },
    );

    // Test 4: READY không kèm file vi phạm invariant; service fail closed.
    it('should reject a ready document without an output file', async () => {
        // Bước 1 - Arrange: mô phỏng record thiếu output reference.
        mockFindUserDocumentByIdForWorkspace.mockResolvedValue({
            ...documentRecord,
            outputFile: null,
        });

        // Bước 2 - Act và Bước 3 - Assert: không cấp URL file hoặc editor config.
        await expect(
            target.execute('document-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
        expect(mockCreateEditorConfig.mock.calls).toEqual([]);
    });

    // Test 5: lỗi từ reader được giữ nguyên và không bị biến thành cấu hình rỗng.
    it('should propagate reader failures without requesting an editor config', async () => {
        // Bước 1 - Arrange: adapter reader báo lỗi persistence.
        const failure = new Error('reader unavailable');
        mockFindUserDocumentByIdForWorkspace.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ lỗi gốc, không gọi adapter ONLYOFFICE.
        await expect(target.execute('document-1', 'workspace-1')).rejects.toBe(
            failure,
        );
        expect(mockCreateEditorConfig.mock.calls).toEqual([]);
    });

    // Test 6 chọn cấu hình Slide Editor cho PPTX để ONLYOFFICE mở đúng loại file.
    it('should request a presentation editor config for PPTX files', async () => {
        // Bước 1 - Arrange: record READY có output file là PPTX trong user workspace.
        const pptxFile = {
            ...documentRecord.outputFile!,
            objectKey: 'presentations/deck.pptx',
            originalFilename: 'deck.pptx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        mockFindUserDocumentByIdForWorkspace.mockResolvedValue({
            ...documentRecord,
            outputFile: pptxFile,
        });

        // Bước 2 - Act: tạo cấu hình cho bản PPTX hiện hành.
        await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: giữ cùng key revision và truyền extension để chọn Slide Editor.
        const expectedKey = createHash('sha256')
            .update(
                `document-1:${pptxFile.storageNamespace}:${pptxFile.objectKey}`,
            )
            .digest('hex');
        expect(mockCreateEditorConfig).toHaveBeenCalledWith(
            'document-1',
            'Báo cáo tháng',
            expectedKey,
            'pptx',
        );
    });
});
