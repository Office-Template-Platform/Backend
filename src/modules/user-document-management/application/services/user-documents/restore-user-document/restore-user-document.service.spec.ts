// Nhóm unit test cho RestoreUserDocumentService: kiểm tra owner scope, file tồn tại và xử lý dữ liệu cũ bị mất file.
// | STT | Test case              | Mục đích                                    | Các bước làm                                  | Kết quả mong đợi                               |
// |-----|------------------------|---------------------------------------------|-----------------------------------------------|------------------------------------------------|
// | 1   | File còn trên storage  | Kiểm tra file rồi khôi phục                  | Reader trả deleted record; storage mở được     | Stream đóng, restorer nhận đúng owner           |
// | 2   | Không có file đầu ra   | Khôi phục record chưa cần file                | Reader trả record không output; gọi execute    | Bỏ qua storage và khôi phục                     |
// | 3   | File đã mất            | Không bật lại tài liệu hỏng                   | Storage báo 404                                | Ném UserDocumentNotReadyError, không restore    |
// | 4   | Không thuộc owner      | Không làm lộ document khác workspace          | Reader trả null                                | Ném UserDocumentNotFoundError                   |
// | 5   | Lỗi storage            | Giữ nguyên lỗi hạ tầng                        | Storage reject lỗi khác 404                    | Truyền nguyên lỗi, không restore                |

import { NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { DocumentFileStorageContract } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import type { UserDocumentReaderContract } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { UserDocumentRecord } from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import type { UserDocumentRestorerContract } from '@/modules/user-document-management/application/contracts/user-document-restorer.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/user-document-management/application/errors/user-document-not-ready.error';
import { RestoreUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/restore-user-document/restore-user-document.service';

describe('RestoreUserDocumentService', () => {
    let target: RestoreUserDocumentService;
    let mockDocumentReader: jest.Mocked<
        Pick<
            UserDocumentReaderContract,
            'findDeletedUserDocumentByIdForWorkspace'
        >
    >;
    let mockFileStorage: jest.Mocked<
        Pick<DocumentFileStorageContract, 'openReadStream'>
    >;
    let mockDocumentRestorer: jest.Mocked<
        Pick<UserDocumentRestorerContract, 'restoreForWorkspace'>
    >;

    beforeEach(() => {
        mockDocumentReader = {
            findDeletedUserDocumentByIdForWorkspace: jest.fn(),
        };
        mockFileStorage = { openReadStream: jest.fn() };
        mockDocumentRestorer = { restoreForWorkspace: jest.fn() };
        target = new RestoreUserDocumentService(
            mockDocumentReader,
            mockFileStorage,
            mockDocumentRestorer,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 kiểm tra stream đầu ra có thể mở trước khi deleted_at được gỡ.
    it('should verify the stored file before restoring the owned document', async () => {
        // Bước 1 - Arrange: deleted record có file và storage mở stream được.
        const record: UserDocumentRecord = {
            id: 'document-1',
            title: 'Báo cáo',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/report.docx',
                originalFilename: 'Báo cáo.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'file-hash',
            },
            sourceTemplate: { id: 'template-1', name: 'Báo cáo', version: 1 },
        };
        const destroyStream = jest.fn();
        const stream = { destroy: destroyStream } as unknown as Readable;
        mockDocumentReader.findDeletedUserDocumentByIdForWorkspace.mockResolvedValue(
            record,
        );
        mockFileStorage.openReadStream.mockResolvedValue(stream);
        mockDocumentRestorer.restoreForWorkspace.mockResolvedValue(true);

        // Bước 2 - Act: khôi phục document sau khi kiểm tra file còn đọc được.
        await target.execute('document-1', 'workspace-1');

        // Bước 3 - Assert: stream đóng ngay, rồi repository nhận đúng workspace để restore.
        expect(destroyStream).toHaveBeenCalledTimes(1);
        expect(mockFileStorage.openReadStream).toHaveBeenCalledWith(
            record.outputFile,
        );
        expect(mockDocumentRestorer.restoreForWorkspace.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
    });

    // Test 2 cho phép khôi phục tài liệu provisioning/failed chưa từng có output file.
    it('should restore a document that does not have an output file', async () => {
        // Bước 1 - Arrange: reader trả record trong thùng rác nhưng chưa có file đầu ra.
        mockDocumentReader.findDeletedUserDocumentByIdForWorkspace.mockResolvedValue(
            {
                id: 'document-2',
                title: 'Bản nháp',
                status: 'provisioning',
                failureCode: null,
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
                downloadUrl: null,
                outputFile: null,
                sourceTemplate: {
                    id: 'template-1',
                    name: 'Mẫu',
                    version: 1,
                },
            },
        );
        mockDocumentRestorer.restoreForWorkspace.mockResolvedValue(true);

        // Bước 2 - Act: khôi phục metadata chưa có output file.
        await target.execute('document-2', 'workspace-1');

        // Bước 3 - Assert: không gọi storage và document vẫn có thể trở lại danh sách.
        expect(mockFileStorage.openReadStream).not.toHaveBeenCalled();
        expect(mockDocumentRestorer.restoreForWorkspace).toHaveBeenCalledWith(
            'document-2',
            'workspace-1',
        );
    });

    // Test 3 từ chối hàng cũ có metadata nhưng file vật lý đã bị xóa bởi phiên bản backend trước.
    it('should not restore a document when its output file is missing', async () => {
        // Bước 1 - Arrange: record đã xóa có output nhưng storage báo file không tồn tại.
        const record: UserDocumentRecord = {
            id: 'document-old',
            title: 'Tài liệu cũ',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-old/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/old.docx',
                originalFilename: 'old.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'file-hash',
            },
            sourceTemplate: { id: 'template-1', name: 'Mẫu', version: 1 },
        };
        mockDocumentReader.findDeletedUserDocumentByIdForWorkspace.mockResolvedValue(
            record,
        );
        mockFileStorage.openReadStream.mockRejectedValue(
            new NotFoundException('Missing file'),
        );

        // Bước 2 - Act và Bước 3 - Assert: trả 409, không đưa record hỏng ra khỏi thùng rác.
        await expect(
            target.execute('document-old', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentNotReadyError);
        expect(mockDocumentRestorer.restoreForWorkspace).not.toHaveBeenCalled();
    });

    // Test 4 giữ cùng 404 cho ID thiếu, sai workspace và tài liệu chưa bị xóa.
    it('should throw not found when the document is outside the current workspace trash', async () => {
        // Bước 1 - Arrange: reader không tìm thấy deleted row trong owner yêu cầu.
        mockDocumentReader.findDeletedUserDocumentByIdForWorkspace.mockResolvedValue(
            null,
        );

        // Bước 2 - Act và Bước 3 - Assert: không chạm storage hoặc repository khôi phục.
        await expect(
            target.execute('document-1', 'workspace-2'),
        ).rejects.toBeInstanceOf(UserDocumentNotFoundError);
        expect(mockFileStorage.openReadStream).not.toHaveBeenCalled();
        expect(mockDocumentRestorer.restoreForWorkspace).not.toHaveBeenCalled();
    });

    // Test 5 phân biệt sự cố storage khác 404 với một file thật sự không còn tồn tại.
    it('should propagate storage failures without restoring the document', async () => {
        // Bước 1 - Arrange: document còn trong thùng rác nhưng storage gặp lỗi hạ tầng.
        const record = {
            id: 'document-1',
            outputFile: {
                provider: 'local' as const,
                storageNamespace: 'user-documents',
                objectKey: 'documents/report.docx',
                originalFilename: 'Báo cáo.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'file-hash',
            },
        } as UserDocumentRecord;
        const failure = new Error('storage unavailable');
        mockDocumentReader.findDeletedUserDocumentByIdForWorkspace.mockResolvedValue(
            record,
        );
        mockFileStorage.openReadStream.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: lỗi storage được giữ nguyên và không cập nhật deleted_at.
        await expect(target.execute('document-1', 'workspace-1')).rejects.toBe(
            failure,
        );
        expect(mockDocumentRestorer.restoreForWorkspace).not.toHaveBeenCalled();
    });
});
