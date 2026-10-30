// Nhóm unit test cho TypeOrmUserDocumentReaderRepository: kiểm tra relations, record mapping và trạng thái missing.
// | STT | Test case       | Mục đích                           | Các bước làm                         | Kết quả mong đợi                           |
// |-----|-----------------|------------------------------------|--------------------------------------|--------------------------------------------|
// | 1   | Record tồn tại  | Nạp file và map metadata           | findOne trả entity; gọi reader       | Record có summary và output file đúng      |
// | 2   | Record thiếu    | Để application xử lý 404          | findOne trả null                     | Reader trả null                            |
// | 3   | Lỗi database    | Giữ nguyên lỗi persistence         | findOne reject                       | Promise reject đúng lỗi gốc                |
import { Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import { UserDocumentStatus } from '@/database/enums/office-template.enums';
import { TypeOrmUserDocumentReaderRepository } from '@/modules/document-template-library/infrastructure/repositories/read/user-documents/typeorm-user-document-reader.repository';

describe('TypeOrmUserDocumentReaderRepository', () => {
    let target: TypeOrmUserDocumentReaderRepository;
    let mockUserDocuments: jest.Mocked<
        Pick<Repository<UserDocument>, 'findOne'>
    >;

    beforeEach(() => {
        mockUserDocuments = { findOne: jest.fn() };
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

    // Test 3 không chuyển lỗi driver thành kết quả null vì service cần phân biệt sự cố hệ thống.
    it('should propagate database failures without changing the error', async () => {
        // Bước 1 - Arrange: repository reject do database offline.
        const failure = new Error('database unavailable');
        mockUserDocuments.findOne.mockRejectedValue(failure);

        // Bước 2 - Act và Bước 3 - Assert: lỗi gốc được giữ nguyên.
        await expect(target.findUserDocumentById('document-1')).rejects.toBe(
            failure,
        );
    });
});
