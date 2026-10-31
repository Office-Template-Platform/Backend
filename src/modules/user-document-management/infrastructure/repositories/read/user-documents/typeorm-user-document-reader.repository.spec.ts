// Nhóm unit test cho TypeOrmUserDocumentReaderRepository: kiểm tra mapping, owner scope, active/trash query và pagination.
// | STT | Test case               | Mục đích                                    | Các bước làm                                      | Kết quả mong đợi                              |
// |-----|-------------------------|---------------------------------------------|---------------------------------------------------|-----------------------------------------------|
// | 1   | Document tồn tại        | Nạp output và source version                 | findOne trả entity có relations; gọi reader       | Record map đủ metadata và file                |
// | 2   | Document không tồn tại  | Để application quyết định lỗi 404             | findOne trả null; gọi reader                      | Reader trả null                               |
// | 3   | Document trong thùng rác| Nạp deleted row và file reference             | withDeleted trả entity có deletedAt              | Map record, giữ workspace scope                |
// | 4   | Document đang hoạt động | Không lộ item thường qua reader thùng rác     | withDeleted trả entity deletedAt null            | Reader trả null                               |
// | 5   | Database lỗi            | Không đổi lỗi repository                       | findOne reject; gọi reader                        | Lỗi gốc được truyền lên                       |
// | 6   | Legacy chưa có owner    | Claim tài liệu an toàn cho workspace          | UPDATE có điều kiện; đọc lại theo workspace       | Chỉ workspace thắng claim được đọc            |
// | 7   | Danh sách hoạt động     | Giữ owner, search, sort và pagination         | Query theo workspace và title                     | SQL loại deleted_at và áp dụng offset          |
// | 8   | Danh sách thùng rác     | Chỉ đọc document đã xóa trong đúng owner      | Bật withDeleted và lọc deleted_at                  | Template đã lưu trữ không bị lộ                |

import { Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { UserDocumentStatus } from '@/database/enums/office-template.enums';
import { TypeOrmUserDocumentReaderRepository } from '@/modules/user-document-management/infrastructure/repositories/read/user-documents/typeorm-user-document-reader.repository';

describe('TypeOrmUserDocumentReaderRepository', () => {
    let target: TypeOrmUserDocumentReaderRepository;
    let mockUserDocuments: jest.Mocked<
        Pick<Repository<UserDocument>, 'findOne'>
    > & { createQueryBuilder: jest.Mock };

    beforeEach(() => {
        mockUserDocuments = {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
        };
        target = new TypeOrmUserDocumentReaderRepository(
            mockUserDocuments as unknown as Repository<UserDocument>,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận query nạp đủ file output và source snapshot để mapper không cần query phụ.
    it('should load required relations and map a stored document record', async () => {
        // Bước 1 - Arrange: tạo entity READY có output và source template relation.
        const outputFile = Object.assign(new StoredFile(), {
            id: 'file-1',
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/resume.docx',
            originalFilename: 'Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'sha256',
        });
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            title: 'Resume',
            status: UserDocumentStatus.READY,
            failureCode: null,
            outputFileId: 'file-1',
            outputFile,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            sourceTemplateVersion: Object.assign(new OfficeTemplateVersion(), {
                templateId: 'template-1',
                versionNumber: 2,
                template: Object.assign(new OfficeTemplate(), {
                    name: 'Resume template',
                }),
            }),
        });
        mockUserDocuments.findOne.mockResolvedValue(document);

        // Bước 2 - Act: đọc record theo ID.
        const result = await target.findUserDocumentById('document-1');

        // Bước 3 - Assert: relation graph, link tải, source snapshot và file reference được map đủ.
        expect(result).toEqual({
            id: 'document-1',
            title: 'Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/resume.docx',
                originalFilename: 'Resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'sha256',
            },
            sourceTemplate: {
                id: 'template-1',
                name: 'Resume template',
                version: 2,
            },
        });
        expect(mockUserDocuments.findOne).toHaveBeenCalledWith({
            where: { id: 'document-1' },
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });
    });

    // Test 2 giữ null để service chọn lỗi nghiệp vụ thay vì repository phụ thuộc HTTP.
    it('should return null when no user document matches the id', async () => {
        // Bước 1 - Arrange: TypeORM không tìm thấy record.
        mockUserDocuments.findOne.mockResolvedValue(null);

        // Bước 2 - Act: đọc document id không tồn tại.
        const result = await target.findUserDocumentById('missing-id');

        // Bước 3 - Assert: adapter trả null, không tự ném HTTP exception.
        expect(result).toBeNull();
    });

    // Test 3 chỉ trả record đã xóa mềm và nạp file metadata cần để xác minh khả năng khôi phục.
    it('should load a deleted document and its file metadata for the current workspace', async () => {
        // Bước 1 - Arrange: entity trong thùng rác còn output metadata và source snapshot.
        const document = Object.assign(new UserDocument(), {
            id: 'document-deleted',
            title: 'Archived report',
            status: UserDocumentStatus.READY,
            failureCode: null,
            outputFileId: 'file-deleted',
            outputFile: Object.assign(new StoredFile(), {
                id: 'file-deleted',
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/archived.docx',
                originalFilename: 'Archived.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '256',
                sha256: 'archived-hash',
            }),
            deletedAt: new Date('2026-10-30T10:00:00.000Z'),
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            updatedAt: new Date('2026-10-02T00:00:00.000Z'),
            sourceTemplateVersion: Object.assign(new OfficeTemplateVersion(), {
                templateId: 'template-1',
                versionNumber: 1,
                template: Object.assign(new OfficeTemplate(), {
                    name: 'Archived template',
                }),
            }),
        });
        mockUserDocuments.findOne.mockResolvedValue(document);

        // Bước 2 - Act: truy vấn record đã xóa theo cả ID và workspace.
        const result = await target.findDeletedUserDocumentByIdForWorkspace(
            'document-deleted',
            'workspace-1',
        );

        // Bước 3 - Assert: record có file reference nội bộ và query bật withDeleted có giới hạn owner.
        expect(result).toMatchObject({
            id: 'document-deleted',
            title: 'Archived report',
            outputFile: {
                objectKey: 'documents/archived.docx',
                storageNamespace: 'user-documents',
            },
        });
        expect(mockUserDocuments.findOne).toHaveBeenCalledWith({
            where: {
                id: 'document-deleted',
                anonymousWorkspaceId: 'workspace-1',
            },
            withDeleted: true,
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });
    });

    // Test 4 không đưa document đang hoạt động vào luồng khôi phục dù query withDeleted có thể nhìn thấy nó.
    it('should return null when the requested workspace document is not deleted', async () => {
        // Bước 1 - Arrange: query tìm thấy document nhưng deletedAt chưa được đặt.
        const document = Object.assign(new UserDocument(), {
            deletedAt: null,
        });
        mockUserDocuments.findOne.mockResolvedValue(document);

        // Bước 2 - Act: yêu cầu reader lấy một document trong thùng rác.
        const result = await target.findDeletedUserDocumentByIdForWorkspace(
            'document-active',
            'workspace-1',
        );

        // Bước 3 - Assert: record hoạt động không vượt qua điều kiện của reader.
        expect(result).toBeNull();
    });

    // Test 5 không chuyển lỗi driver thành kết quả null vì service cần phân biệt sự cố hệ thống.
    it('should propagate database failures without changing the error', async () => {
        // Bước 1 - Arrange: repository reject do database offline.
        const failure = new Error('database unavailable');
        mockUserDocuments.findOne.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc được giữ nguyên.
        await expect(target.findUserDocumentById('document-1')).rejects.toBe(
            failure,
        );
    });

    // Test 6 claim legacy document bằng UPDATE có điều kiện để hai workspace không thể cùng nhận quyền.
    it('should claim an unowned legacy document only for the requesting workspace', async () => {
        // Bước 1 - Arrange: query builder mô phỏng UPDATE owner nếu cột hiện còn NULL.
        const queryBuilder = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        mockUserDocuments.createQueryBuilder.mockReturnValue(queryBuilder);
        const document = Object.assign(new UserDocument(), {
            id: 'document-4',
            title: 'Old report',
            status: UserDocumentStatus.READY,
            failureCode: null,
            outputFileId: null,
            outputFile: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            sourceTemplateVersion: Object.assign(new OfficeTemplateVersion(), {
                templateId: 'template-1',
                versionNumber: 1,
                template: Object.assign(new OfficeTemplate(), {
                    name: 'Archived report',
                }),
            }),
        });
        mockUserDocuments.findOne.mockResolvedValue(document);

        // Bước 2 - Act: mở tài liệu cũ trong workspace mới được cấp.
        const result = await target.findUserDocumentByIdForWorkspace(
            'document-4',
            'workspace-4',
        );

        // Bước 3 - Assert: UPDATE chỉ claim row chưa có owner, rồi đọc lại với điều kiện owner.
        expect(result).toMatchObject({ id: 'document-4', title: 'Old report' });
        expect(queryBuilder.update).toHaveBeenCalledWith(UserDocument);
        expect(queryBuilder.set).toHaveBeenCalledWith({
            anonymousWorkspaceId: 'workspace-4',
        });
        expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', {
            id: 'document-4',
        });
        expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
            1,
            'anonymous_workspace_id IS NULL',
        );
        expect(mockUserDocuments.findOne).toHaveBeenCalledWith({
            where: { id: 'document-4', anonymousWorkspaceId: 'workspace-4' },
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });
    });

    // Test 7 kiểm tra tìm kiếm và phân trang được áp dụng sau điều kiện owner bắt buộc.
    it('should filter and paginate only the current workspace documents', async () => {
        // Bước 1 - Arrange: builder thu query và trả page rỗng cùng tổng matching record.
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            withDeleted: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };
        mockUserDocuments.createQueryBuilder.mockReturnValue(queryBuilder);

        // Bước 2 - Act: tìm kiếm trong trang 2 của workspace được xác thực.
        const result = await target.listUserDocumentsByWorkspace(
            'workspace-5',
            { page: 2, limit: 10, search: '  report  ' },
        );

        // Bước 3 - Assert: mọi điều kiện SQL đều giữ workspace boundary và offset chính xác.
        expect(result).toEqual({ items: [], total: 0 });
        expect(queryBuilder.where).toHaveBeenCalledWith(
            'document.anonymousWorkspaceId = :workspaceId',
            { workspaceId: 'workspace-5' },
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'document.deletedAt IS NULL',
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'document.title ILIKE :search',
            { search: '%report%' },
        );
        expect(queryBuilder.orderBy).toHaveBeenCalledWith(
            'document.updatedAt',
            'DESC',
        );
        expect(queryBuilder.skip).toHaveBeenCalledWith(10);
        expect(queryBuilder.take).toHaveBeenCalledWith(10);
    });

    // Test 8 nạp deleted rows có scope workspace và vẫn loại template đã lưu trữ khỏi relation công khai.
    it('should list only deleted documents for the current workspace', async () => {
        // Bước 1 - Arrange: builder cho phép đọc soft-deleted row và trả trang rỗng.
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            withDeleted: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };
        mockUserDocuments.createQueryBuilder.mockReturnValue(queryBuilder);

        // Bước 2 - Act: lấy trang đầu thùng rác của workspace đã xác thực.
        const result = await target.listDeletedUserDocumentsByWorkspace(
            'workspace-6',
            { page: 1, limit: 8 },
        );

        // Bước 3 - Assert: query mở deleted rows nhưng khóa theo owner và chỉ trả deleted document.
        expect(result).toEqual({ items: [], total: 0 });
        expect(queryBuilder.withDeleted).toHaveBeenCalledTimes(1);
        expect(queryBuilder.where).toHaveBeenCalledWith(
            'document.anonymousWorkspaceId = :workspaceId',
            { workspaceId: 'workspace-6' },
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'document.deletedAt IS NOT NULL',
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            '(sourceTemplate.deletedAt IS NULL OR sourceTemplate.id IS NULL)',
        );
        expect(queryBuilder.skip).toHaveBeenCalledWith(0);
        expect(queryBuilder.take).toHaveBeenCalledWith(8);
    });
});
