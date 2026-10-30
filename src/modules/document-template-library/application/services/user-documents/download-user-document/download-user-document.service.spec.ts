// Nhóm unit test cho DownloadUserDocumentService: xác nhận chỉ cấp file cho tài liệu READY có output và phân biệt lỗi thiếu tài liệu.
// | STT | Test case          | Mục đích                                | Các bước làm                                   | Kết quả mong đợi                     |
// |-----|--------------------|-----------------------------------------|------------------------------------------------|--------------------------------------|
// | 1   | Tài liệu READY     | Cấp reference và tên tải DOCX           | Reader trả record READY có output; gọi execute | Trả file reference và filename .docx |
// | 2   | Không tìm thấy     | Báo tài liệu không tồn tại              | Reader trả null; gọi execute                   | Ném UserDocumentNotFoundError        |
// | 3   | READY thiếu output | Chặn tải khi metadata file không đầy đủ | Reader trả READY nhưng outputFile=null         | Ném UserDocumentNotReadyError        |
// | 4   | File PPTX          | Giữ đúng đuôi khi tải bản trình chiếu   | Reader trả READY/PPTX; gọi execute             | Trả filename có đuôi .pptx            |
// | 5   | MIME không hỗ trợ  | Từ chối định dạng không Office          | Reader trả READY/PDF; gọi execute              | Ném UnsupportedMediaTypeException    |

import { UnsupportedMediaTypeException } from '@nestjs/common';
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { DownloadUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/download-user-document/download-user-document.service';

describe('DownloadUserDocumentService', () => {
    let target: DownloadUserDocumentService;
    let mockDocumentReader: jest.Mocked<
        Pick<UserDocumentReaderContract, 'findUserDocumentByIdForWorkspace'>
    >;

    beforeEach(() => {
        mockDocumentReader = { findUserDocumentByIdForWorkspace: jest.fn() };
        target = new DownloadUserDocumentService(mockDocumentReader);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận chỉ metadata file hiện hành được cấp cho controller tải xuống.
    it('should return the current file and a DOCX filename for a ready document', async () => {
        // Bước 1 - Arrange: chuẩn bị tài liệu READY có output file riêng.
        const file = {
            provider: 'local' as const,
            storageNamespace: 'user-documents',
            objectKey: 'documents/document-1.docx',
            originalFilename: 'My resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'hash',
        };
        const record: UserDocumentRecord = {
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: file,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        };
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
            record,
        );

        // Bước 2 - Act: lấy file reference theo document id.
        const result = await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: file hiện tại và tên đuôi DOCX được trả chính xác.
        expect(result).toEqual({ file, filename: 'My resume.docx' });
        expect(
            mockDocumentReader.findUserDocumentByIdForWorkspace.mock.calls,
        ).toEqual([['document-1', 'workspace-1']]);
    });

    // Test 2 phân biệt UUID sai dữ liệu với file đang chờ xử lý.
    it('should throw a not-found error when the document does not exist', async () => {
        // Bước 1 - Arrange: reader trả null vì không có bản ghi.
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
            null,
        );

        // Bước 2 - Act và Bước 3 - Assert: trả đúng lỗi 404 application.
        await expect(
            target.execute('missing-id', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
    });

    // Test 3 chặn các trạng thái provisioning/failed để client không tải file dở dang.
    it.each(['provisioning', 'failed'] as const)(
        'should reject a document in %s state',
        async (status) => {
            // Bước 1 - Arrange: bản ghi tồn tại nhưng chưa ở trạng thái READY.
            mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue(
                {
                    id: 'document-1',
                    title: 'My resume',
                    status,
                    failureCode: status === 'failed' ? 'COPY_FAILED' : null,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                    downloadUrl: null,
                    outputFile: null,
                    sourceTemplate: {
                        id: 'template-1',
                        name: 'Resume',
                        version: 1,
                    },
                },
            );

            // Bước 2 - Act và Bước 3 - Assert: trả HTTP 409 để client thử lại khi phù hợp.
            await expect(
                target.execute('document-1', 'workspace-1'),
            ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
        },
    );

    // Test 4 bảo vệ invariant ngay cả khi persistence trả READY nhưng thiếu quan hệ file.
    it('should reject a ready document that has no output file reference', async () => {
        // Bước 1 - Arrange: tạo trạng thái không hợp lệ để xác nhận service fail closed.
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue({
            id: 'document-1',
            title: 'My resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: null,
            outputFile: null,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        });

        // Bước 2 - Act và Bước 3 - Assert: không cho controller mở stream rỗng.
        await expect(
            target.execute('document-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
    });

    // Test 4 dùng MIME của StoredFile để tạo đúng extension cho bản presentation.
    it('should return a PPTX filename for a ready presentation', async () => {
        // Bước 1 - Arrange: workspace có tài liệu READY với MIME PPTX chuẩn.
        const file = {
            provider: 'local' as const,
            storageNamespace: 'user-documents',
            objectKey: 'presentations/deck.pptx',
            originalFilename: 'Quarterly deck.pptx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            sizeBytes: '1024',
            sha256: 'hash',
        };
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue({
            id: 'document-2',
            title: 'Quarterly deck',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-2/download',
            outputFile: file,
            sourceTemplate: { id: 'template-2', name: 'Deck', version: 1 },
        });

        // Bước 2 - Act: lấy nội dung tải xuống theo document ID và workspace.
        const result = await target.execute('document-2', 'workspace-1');

        // Bước 3 - Assert: file reference được giữ và tên tải xuống kết thúc bằng .pptx.
        expect(result).toEqual({ file, filename: 'Quarterly deck.pptx' });
    });

    // Test 5 không phát hành file có MIME lạ dưới dạng download Office.
    it('should reject a ready file with an unsupported MIME type', async () => {
        // Bước 1 - Arrange: reader trả file PDF dù record đang ở trạng thái READY.
        mockDocumentReader.findUserDocumentByIdForWorkspace.mockResolvedValue({
            id: 'document-3',
            title: 'Unexpected file',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-3/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/file.pdf',
                originalFilename: 'file.pdf',
                mimeType: 'application/pdf',
                sizeBytes: '10',
                sha256: null,
            },
            sourceTemplate: { id: 'template-3', name: 'Template', version: 1 },
        });

        // Bước 2 - Act và Bước 3 - Assert: MIME lạ bị từ chối trước khi storage mở file.
        await expect(
            target.execute('document-3', 'workspace-1'),
        ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });
});
