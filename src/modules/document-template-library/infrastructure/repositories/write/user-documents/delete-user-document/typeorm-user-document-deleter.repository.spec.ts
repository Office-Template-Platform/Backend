// Nhóm unit test cho TypeOrmUserDocumentDeleterRepository: kiểm tra owner scope, xóa mềm và an toàn file dùng chung.
// | STT | Test case          | Mục đích                                    | Các bước làm                                           | Kết quả mong đợi                                   |
// |-----|--------------------|---------------------------------------------|--------------------------------------------------------|----------------------------------------------------|
// | 1   | Đúng workspace     | Xóa mềm và trả file không còn được dùng     | Khóa document; soft-delete; không có reference khác   | Trả file reference sau transaction                 |
// | 2   | Khác workspace     | Ngăn xóa chéo và không lộ quyền sở hữu      | Tìm document theo ID và workspace; query trả null     | Trả null, không gọi softDelete                     |
// | 3   | File dùng chung    | Không xóa output document khác đang dùng     | Sau soft-delete, query tìm được reference còn hoạt động | fileToCleanup là null                              |
// | 4   | Thiếu file metadata | Rollback khi FK output không có StoredFile  | Tìm thấy document nhưng StoredFile trả null           | Transaction reject, không gọi softDelete           |
// | 5   | Chưa có output      | Xóa record provisioning/failed             | Document có output_file_id null; soft-delete thành công | Trả fileToCleanup null                            |
// | 6   | DB không cập nhật   | Không cleanup khi xóa mềm không tác động    | softDelete trả affected = 0                            | Transaction reject trước khi kiểm tra reference    |

import { DataSource, EntityManager, Not } from 'typeorm';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { FileStorageProvider } from '@/database/enums/office-template.enums';
import { TypeOrmUserDocumentDeleterRepository } from '@/modules/document-template-library/infrastructure/repositories/write/user-documents/delete-user-document/typeorm-user-document-deleter.repository';

describe('TypeOrmUserDocumentDeleterRepository', () => {
    let target: TypeOrmUserDocumentDeleterRepository;
    let mockManager: jest.Mocked<Pick<EntityManager, 'findOne' | 'softDelete'>>;
    let mockTransaction: jest.Mock;
    let mockDataSource: DataSource;

    beforeEach(() => {
        mockManager = {
            findOne: jest.fn(),
            softDelete: jest.fn(),
        };
        mockTransaction = jest.fn(
            (work: (manager: EntityManager) => Promise<unknown>) =>
                work(mockManager as unknown as EntityManager),
        );
        mockDataSource = {
            transaction: mockTransaction,
        } as unknown as DataSource;
        target = new TypeOrmUserDocumentDeleterRepository(mockDataSource);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận adapter khóa owner row, xóa mềm rồi trả file để application cleanup sau commit.
    it('should soft-delete the owned document and return its unshared output file', async () => {
        // Bước 1 - Arrange: document thuộc workspace-1 có file local và không có reference hoạt động khác.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: 'file-1',
        });
        const storedFile = Object.assign(new StoredFile(), {
            id: 'file-1',
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'user-documents',
            objectKey: 'documents/resume.docx',
            originalFilename: 'Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'content-hash',
        });
        mockManager.findOne
            .mockResolvedValueOnce(document)
            .mockResolvedValueOnce(storedFile)
            .mockResolvedValueOnce(null);
        mockManager.softDelete.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: xóa trong transaction, cung cấp owner lấy từ workspace guard.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: query có row lock, soft-delete có workspace scope và file reference được map an toàn.
        expect(result).toEqual({
            fileToCleanup: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/resume.docx',
                originalFilename: 'Resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'content-hash',
            },
        });
        expect(mockManager.findOne).toHaveBeenNthCalledWith(1, UserDocument, {
            where: {
                id: 'document-1',
                anonymousWorkspaceId: 'workspace-1',
            },
            lock: { mode: 'pessimistic_write' },
        });
        expect(mockManager.softDelete).toHaveBeenCalledWith(UserDocument, {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
        });
        expect(mockManager.findOne).toHaveBeenNthCalledWith(3, UserDocument, {
            where: { id: Not('document-1'), outputFileId: 'file-1' },
            select: { id: true },
        });
    });

    // Test 2 bảo đảm document khác owner được xem như không tồn tại và không phát sinh thay đổi database.
    it('should return null without deleting when the workspace does not own the document', async () => {
        // Bước 1 - Arrange: query có cả document ID lẫn workspace ID nhưng không tìm thấy row phù hợp.
        mockManager.findOne.mockResolvedValue(null);

        // Bước 2 - Act: thử xóa document bằng workspace không sở hữu.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-2',
        );

        // Bước 3 - Assert: trả null cho service ánh xạ 404 và không gọi lệnh soft-delete.
        expect(result).toBeNull();
        expect(mockManager.softDelete).not.toHaveBeenCalled();
        expect(mockManager.findOne).toHaveBeenCalledTimes(1);
    });

    // Test 3 giữ nguyên object vật lý nếu document hoạt động khác còn tham chiếu cùng StoredFile.
    it('should not return a file for cleanup when another active document references it', async () => {
        // Bước 1 - Arrange: row bị xóa và một row hoạt động khác vẫn dùng file-1.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: 'file-1',
        });
        const storedFile = Object.assign(new StoredFile(), {
            id: 'file-1',
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'user-documents',
            objectKey: 'documents/shared.docx',
            originalFilename: 'Shared.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'content-hash',
        });
        const activeDocument = Object.assign(new UserDocument(), {
            id: 'document-2',
        });
        mockManager.findOne
            .mockResolvedValueOnce(document)
            .mockResolvedValueOnce(storedFile)
            .mockResolvedValueOnce(activeDocument);
        mockManager.softDelete.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: xóa mềm document đầu tiên trong workspace của nó.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: DB xóa đúng row nhưng không giao file đang dùng chung cho storage cleanup.
        expect(result).toEqual({ fileToCleanup: null });
        expect(mockManager.softDelete).toHaveBeenCalledTimes(1);
    });

    // Test 4 rollback thay đổi nếu metadata output không tồn tại dù document đang giữ FK tới file đó.
    it('should abort deletion when the output file metadata is missing', async () => {
        // Bước 1 - Arrange: document có output_file_id nhưng lookup StoredFile không tìm thấy metadata.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: 'missing-file',
        });
        mockManager.findOne
            .mockResolvedValueOnce(document)
            .mockResolvedValueOnce(null);

        // Bước 2 - Act và Bước 3 - Assert: transaction reject trước soft-delete để không che invariant DB hỏng.
        await expect(
            target.deleteForWorkspace('document-1', 'workspace-1'),
        ).rejects.toThrow(
            'User document output file disappeared during deletion.',
        );
        expect(mockManager.softDelete).not.toHaveBeenCalled();
    });

    // Test 5 cho phép xóa tài liệu provisioning/failed chưa có file mà không truy vấn hay dọn storage.
    it('should soft-delete a document that does not have an output file', async () => {
        // Bước 1 - Arrange: document thuộc workspace nhưng chưa được gắn output_file_id.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: null,
        });
        mockManager.findOne.mockResolvedValueOnce(document);
        mockManager.softDelete.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: xóa mềm record chưa có file đầu ra.
        const result = await target.deleteForWorkspace(
            'document-1',
            'workspace-1',
        );

        // Bước 3 - Assert: transaction hoàn tất nhưng không thực hiện lookup StoredFile hay reference cleanup.
        expect(result).toEqual({ fileToCleanup: null });
        expect(mockManager.findOne).toHaveBeenCalledTimes(1);
        expect(mockManager.softDelete).toHaveBeenCalledTimes(1);
    });

    // Test 6 giữ transaction thất bại nếu DB không xác nhận đã xóa mềm row đang khóa.
    it('should abort before checking file references when soft-delete affects no rows', async () => {
        // Bước 1 - Arrange: row được nạp nhưng câu lệnh softDelete báo affected bằng 0.
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            anonymousWorkspaceId: 'workspace-1',
            outputFileId: null,
        });
        mockManager.findOne.mockResolvedValueOnce(document);
        mockManager.softDelete.mockResolvedValue({
            affected: 0,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act và Bước 3 - Assert: transaction reject trước khi có thể trả file cho cleanup.
        await expect(
            target.deleteForWorkspace('document-1', 'workspace-1'),
        ).rejects.toThrow('User document could not be soft-deleted.');
        expect(mockManager.findOne).toHaveBeenCalledTimes(1);
    });
});
