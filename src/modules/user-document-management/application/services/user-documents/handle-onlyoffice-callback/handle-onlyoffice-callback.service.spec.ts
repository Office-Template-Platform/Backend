// Nhóm unit test cho HandleOnlyOfficeCallbackService: xác thực callback, kiểm tra DOCX và bảo vệ cập nhật theo revision khi editor lưu.
// | STT | Test case              | Mục đích                                | Các bước làm                                                              | Kết quả mong đợi                                   |
// |-----|------------------------|-----------------------------------------|---------------------------------------------------------------------------|----------------------------------------------------|
// | 1   | Callback lưu hợp lệ    | Tải và lưu DOCX cuối theo revision      | Token hợp lệ; callback có URL; tải file; gọi writer với expected revision | Lưu đúng nội dung và cập nhật revision             |
// | 2   | Token callback sai     | Chặn callback trước khi đọc document    | Gửi token không hợp lệ; gọi handler                                       | Ném lỗi xác thực, reader không được gọi            |
// | 3   | Thiếu file URL         | Từ chối callback cuối không có file     | Gửi callback final-save không có URL                                      | Ném lỗi request, không tải file                    |
// | 4   | Document không tồn tại | Báo not-found cho callback              | Token hợp lệ; reader trả null                                             | Ném UserDocumentNotFoundError                      |
// | 5   | Revision đã cũ         | Bỏ qua callback stale an toàn           | Callback revision cũ hơn bản hiện tại                                     | ACK thành công, không tải hoặc lưu file            |
// | 6   | File không phải DOCX   | Chặn nội dung sai định dạng             | Tải callback file có loại không hỗ trợ                                    | Ném lỗi validation, writer không chạy              |
// | 7   | Tải file lỗi           | Không ghi khi nguồn tải thất bại        | Docs download reject                                                      | Truyền lỗi lên, writer không chạy                  |
// | 8   | File vượt giới hạn     | Chặn DOCX lớn hơn 25 MiB                | Tải payload vượt ngưỡng dung lượng                                        | Ném lỗi giới hạn, writer không chạy                |
// | 9   | Revision xung đột      | ACK xung đột thay vì ghi đè bản mới hơn | Writer báo expected revision không còn khớp                               | Callback được xử lý an toàn, không ghi đè revision |
// | 10  | Lỗi save bất ngờ       | Giữ nguyên lỗi persistence              | Writer ném lỗi không phải conflict                                        | Lỗi gốc được truyền lên                            |

import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import type { OnlyOfficeCallbackPayload } from '@/integrations/onlyoffice/types/onlyoffice-docs.types';
import type { UserDocumentReaderContract } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { UserDocumentRecord } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/user-document-management/application/errors/user-document-not-ready.error';
import { UserDocumentRevisionConflictError } from '@/modules/user-document-management/application/errors/user-document-revision-conflict.error';
import { SaveUserDocumentContentService } from '@/modules/user-document-management/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import { HandleOnlyOfficeCallbackService } from '@/modules/user-document-management/application/services/user-documents/handle-onlyoffice-callback/handle-onlyoffice-callback.service';

const documentId = 'document-1';
const authorizationHeader = 'Bearer signed-callback-token';
const currentFile: StoredFileReference = {
    provider: 'local',
    storageNamespace: 'user-documents',
    objectKey: 'documents/document-1.docx',
    originalFilename: 'Báo cáo tháng.docx',
    mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: '512',
    sha256: 'file-checksum',
};
const readyDocument: UserDocumentRecord = {
    id: documentId,
    title: 'Báo cáo tháng',
    status: 'ready',
    failureCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    downloadUrl: `/api/user-documents/${documentId}/download`,
    outputFile: currentFile,
    sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 3 },
};
const expectedKey = createHash('sha256')
    .update(
        `${documentId}:${currentFile.storageNamespace}:${currentFile.objectKey}`,
    )
    .digest('hex');
const validDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml word/document.xml'),
]);
const savedDocumentSummary = {
    id: documentId,
    title: 'Báo cáo tháng',
    status: 'ready' as const,
    failureCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    downloadUrl: `/api/user-documents/${documentId}/download`,
    sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 3 },
};

describe('HandleOnlyOfficeCallbackService', () => {
    let target: HandleOnlyOfficeCallbackService;
    let mockDocumentReader: jest.Mocked<
        Pick<UserDocumentReaderContract, 'findUserDocumentById'>
    >;
    let mockOnlyOfficeDocs: jest.Mocked<
        Pick<OnlyOfficeDocsService, 'verifyCallback' | 'downloadEditedDocument'>
    >;
    let mockSaveDocumentContent: jest.Mocked<
        Pick<SaveUserDocumentContentService, 'executeFromOnlyOfficeCallback'>
    >;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        mockDocumentReader = { findUserDocumentById: jest.fn() };
        mockOnlyOfficeDocs = {
            verifyCallback: jest.fn().mockResolvedValue(undefined),
            downloadEditedDocument: jest.fn().mockResolvedValue(validDocx),
        };
        mockSaveDocumentContent = {
            executeFromOnlyOfficeCallback: jest
                .fn()
                .mockResolvedValue(savedDocumentSummary),
        };
        target = new HandleOnlyOfficeCallbackService(
            mockDocumentReader,
            mockOnlyOfficeDocs as unknown as OnlyOfficeDocsService,
            mockSaveDocumentContent as unknown as SaveUserDocumentContentService,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    // Tạo callback status 2 mặc định để các test chỉ thay đổi điều kiện đang kiểm tra.
    function createCallback(
        overrides: Partial<OnlyOfficeCallbackPayload> = {},
    ): OnlyOfficeCallbackPayload {
        return {
            key: expectedKey,
            status: 2,
            url: 'http://onlyoffice/cache/files/document-1.docx',
            filetype: 'docx',
            ...overrides,
        };
    }

    // Test 1: callback cuối có chữ ký và DOCX hợp lệ thay đúng file revision hiện hành.
    it('should download and save the final DOCX with an expected revision guard', async () => {
        // Bước 1 - Arrange: reader trả bản sao READY, callback key trỏ tới file hiện tại.
        const payload = createCallback();
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );

        // Bước 2 - Act: nhận callback cuối sau khi người dùng đóng editor.
        await target.execute(documentId, authorizationHeader, payload);

        // Bước 3 - Assert: xác minh JWT trước, tải từ URL callback và lưu với CAS của object cũ.
        expect(mockOnlyOfficeDocs.verifyCallback.mock.calls).toEqual([
            [authorizationHeader, payload],
        ]);
        expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual([
            [documentId],
        ]);
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual([
            [payload.url],
        ]);
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([
            [
                documentId,
                validDocx,
                'Báo cáo tháng.docx',
                {
                    storageNamespace: currentFile.storageNamespace,
                    objectKey: currentFile.objectKey,
                },
            ],
        ]);
    });

    // Test 2: token callback sai phải bị từ chối trước mọi truy vấn và tải file.
    it('should reject an invalid callback token before reading the document', async () => {
        // Bước 1 - Arrange: ONLYOFFICE JWT verifier từ chối request.
        const failure = new Error('invalid callback token');
        mockOnlyOfficeDocs.verifyCallback.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: lỗi xác thực truyền nguyên vẹn và không phát sinh I/O sau đó.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).rejects.toBe(failure);
        expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual([]);
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual(
            [],
        );
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([]);
    });

    // Test 3: key rỗng hoặc status không nguyên đều bị từ chối sau xác thực JWT.
    it.each([
        ['empty key', { key: '' }],
        ['non-integer status', { status: 2.5 }],
    ] as const)(
        'should reject a callback with %s',
        async (_caseName, overrides) => {
            // Bước 1 - Arrange: payload ký hợp lệ nhưng thiếu một trường bắt buộc theo contract.
            const payload = createCallback(overrides);

            // Bước 2 - Act và Bước 3 - Assert: không đọc file hoặc document nếu payload sai hình dạng.
            await expect(
                target.execute(documentId, authorizationHeader, payload),
            ).rejects.toThrow('Callback ONLYOFFICE thiếu trạng thái hoặc key.');
            expect(mockOnlyOfficeDocs.verifyCallback.mock.calls).toEqual([
                [authorizationHeader, payload],
            ]);
            expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual(
                [],
            );
        },
    );

    // Test 4: trạng thái không cần lưu được ACK mà không truy cập DB hay storage.
    it.each([1, 4, 6])(
        'should acknowledge status %s without reading or saving the document',
        async (status) => {
            // Bước 1 - Arrange: tạo payload hợp lệ với trạng thái trung gian/đóng không đổi.
            const payload = createCallback({ status });

            // Bước 2 - Act: callback hoàn tất.
            await target.execute(documentId, authorizationHeader, payload);

            // Bước 3 - Assert: token vẫn phải hợp lệ nhưng không cần đọc hoặc ghi file.
            expect(mockOnlyOfficeDocs.verifyCallback.mock.calls).toEqual([
                [authorizationHeader, payload],
            ]);
            expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual(
                [],
            );
            expect(
                mockOnlyOfficeDocs.downloadEditedDocument.mock.calls,
            ).toEqual([]);
            expect(
                mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock
                    .calls,
            ).toEqual([]);
        },
    );

    // Test 5: callback status 3/7 biểu thị lỗi lưu, không được coi là nội dung mới.
    it.each([3, 7])(
        'should reject status %s when ONLYOFFICE reports a save failure',
        async (status) => {
            // Bước 1 - Arrange: callback đã ký nhưng Document Server báo không lưu được.
            const payload = createCallback({ status });

            // Bước 2 - Act và Bước 3 - Assert: trả lỗi callback và không tiếp tục đọc file.
            await expect(
                target.execute(documentId, authorizationHeader, payload),
            ).rejects.toThrow('ONLYOFFICE không lưu được tài liệu.');
            expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual(
                [],
            );
            expect(
                mockOnlyOfficeDocs.downloadEditedDocument.mock.calls,
            ).toEqual([]);
        },
    );

    // Test 6: status 2 thiếu URL file không được đi vào bước tải hoặc commit.
    it('should reject a final-save callback without a file URL', async () => {
        // Bước 1 - Arrange: callback cuối thiếu URL mà ONLYOFFICE cần cung cấp.
        const payload = createCallback({ url: undefined });

        // Bước 2 - Act và Bước 3 - Assert: phản hồi lỗi payload, không truy vấn tài liệu.
        await expect(
            target.execute(documentId, authorizationHeader, payload),
        ).rejects.toThrow('Callback lưu cuối không có URL file.');
        expect(mockDocumentReader.findUserDocumentById.mock.calls).toEqual([]);
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual(
            [],
        );
    });

    // Test 7: callback hợp lệ nhưng document đã bị xóa trả lỗi not found.
    it('should throw not found when the callback document does not exist', async () => {
        // Bước 1 - Arrange: chữ ký hợp lệ nhưng reader không còn document.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: không thử tải file hoặc cập nhật metadata.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual(
            [],
        );
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([]);
    });

    // Test 8: chỉ tài liệu READY có output file mới nhận được bản lưu từ editor.
    it.each([
        ['provisioning', 'provisioning', null],
        ['failed', 'failed', null],
        ['ready without a file', 'ready', null],
    ] as const)(
        'should reject a %s document before downloading the edited file',
        async (_caseName, status, outputFile) => {
            // Bước 1 - Arrange: trạng thái hoặc output reference không đáp ứng invariant ghi file.
            mockDocumentReader.findUserDocumentById.mockResolvedValue({
                ...readyDocument,
                status,
                outputFile,
            });

            // Bước 2 - Act và Bước 3 - Assert: giữ trạng thái chưa sẵn sàng và không gọi storage/API Docs.
            await expect(
                target.execute(
                    documentId,
                    authorizationHeader,
                    createCallback(),
                ),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
            expect(
                mockOnlyOfficeDocs.downloadEditedDocument.mock.calls,
            ).toEqual([]);
            expect(
                mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock
                    .calls,
            ).toEqual([]);
        },
    );

    // Test 9: callback của revision cũ được ACK nhưng không thể ghi đè object mới.
    it('should acknowledge a stale revision without downloading or saving it', async () => {
        // Bước 1 - Arrange: key trong callback khác key của output hiện tại.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        const payload = createCallback({ key: 'older-revision-key' });

        // Bước 2 - Act: callback cũ được xem như đã xử lý để server không retry.
        await target.execute(documentId, authorizationHeader, payload);

        // Bước 3 - Assert: stale callback không tải URL và không thay document content.
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual(
            [],
        );
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([]);
    });

    // Test 10: callback có định dạng khác tài liệu đang sửa bị từ chối trước khi tải.
    it('should reject a callback file type that differs from the current document', async () => {
        // Bước 1 - Arrange: revision DOCX hợp lệ nhưng callback khai định dạng PPTX.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );

        // Bước 2 - Act và Bước 3 - Assert: không tải file khác định dạng đầu vào.
        await expect(
            target.execute(
                documentId,
                authorizationHeader,
                createCallback({ filetype: 'pptx' }),
            ),
        ).rejects.toThrow(
            'ONLYOFFICE trả về định dạng khác với file đang sửa.',
        );
        expect(mockOnlyOfficeDocs.downloadEditedDocument.mock.calls).toEqual(
            [],
        );
    });

    // Test 11: URL tải từ Document Server bị lỗi thì không ghi nội dung dở dang.
    it('should propagate download failures without saving document content', async () => {
        // Bước 1 - Arrange: reader hợp lệ nhưng Docs Server không thể trả file cuối.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        const failure = new Error('download unavailable');
        mockOnlyOfficeDocs.downloadEditedDocument.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: giữ lỗi upstream và không gọi save use case.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).rejects.toBe(failure);
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([]);
    });

    // Test 12: DOCX thiếu ZIP header hoặc một OOXML part bắt buộc bị từ chối.
    it.each([
        ['ZIP header', Buffer.from('[Content_Types].xml word/document.xml')],
        [
            'content types part',
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                Buffer.from('word/document.xml'),
            ]),
        ],
        [
            'document XML part',
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                Buffer.from('[Content_Types].xml'),
            ]),
        ],
    ])(
        'should reject a DOCX without a valid %s',
        async (_caseName, invalidDocx) => {
            // Bước 1 - Arrange: Document Server tải xuống nội dung không có cấu trúc DOCX tối thiểu.
            mockDocumentReader.findUserDocumentById.mockResolvedValue(
                readyDocument,
            );
            mockOnlyOfficeDocs.downloadEditedDocument.mockResolvedValue(
                invalidDocx,
            );

            // Bước 2 - Act và Bước 3 - Assert: chặn trước khi cập nhật output reference.
            await expect(
                target.execute(
                    documentId,
                    authorizationHeader,
                    createCallback(),
                ),
            ).rejects.toThrow('ONLYOFFICE trả về file Office không hợp lệ.');
            expect(
                mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock
                    .calls,
            ).toEqual([]);
        },
    );

    // Test 13: file Office lớn hơn 25 MB bị từ chối trước bước lưu.
    it('should reject an edited Office file larger than 25 MB', async () => {
        // Bước 1 - Arrange: tải về file vượt ngưỡng cho phép đúng một byte.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        mockOnlyOfficeDocs.downloadEditedDocument.mockResolvedValue(
            Buffer.alloc(25 * 1024 * 1024 + 1),
        );

        // Bước 2 - Act và Bước 3 - Assert: trả Payload Too Large và không gọi use case lưu.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).rejects.toThrow('File sau chỉnh sửa vượt quá 25 MB.');
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([]);
    });

    // Test 14: conflict CAS cho biết callback đã cũ được ACK để không retry ghi đè revision mới.
    it('should acknowledge a revision conflict during the final save', async () => {
        // Bước 1 - Arrange: bản DOCX hợp lệ nhưng một editor khác commit trước callback này.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        mockSaveDocumentContent.executeFromOnlyOfficeCallback.mockRejectedValue(
            new UserDocumentRevisionConflictError(),
        );

        // Bước 2 - Act: conflict được xử lý như callback stale.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).resolves.toBeUndefined();

        // Bước 3 - Assert: callback vẫn chỉ thử commit một lần với reference CAS cũ.
        expect(
            mockSaveDocumentContent.executeFromOnlyOfficeCallback.mock.calls,
        ).toEqual([
            [
                documentId,
                validDocx,
                'Báo cáo tháng.docx',
                {
                    storageNamespace: currentFile.storageNamespace,
                    objectKey: currentFile.objectKey,
                },
            ],
        ]);
    });

    // Test 15: lỗi ghi không phải conflict phải nổi lên để ONLYOFFICE có thể retry callback.
    it('should propagate unexpected save failures', async () => {
        // Bước 1 - Arrange: đọc/tải DOCX thành công nhưng storage/database không lưu được.
        mockDocumentReader.findUserDocumentById.mockResolvedValue(
            readyDocument,
        );
        const failure = new Error('database unavailable');
        mockSaveDocumentContent.executeFromOnlyOfficeCallback.mockRejectedValue(
            failure,
        );

        // Bước 2 - Act và Bước 3 - Assert: lỗi hạ tầng không bị ACK nhầm như callback cũ.
        await expect(
            target.execute(documentId, authorizationHeader, createCallback()),
        ).rejects.toBe(failure);
    });
});
