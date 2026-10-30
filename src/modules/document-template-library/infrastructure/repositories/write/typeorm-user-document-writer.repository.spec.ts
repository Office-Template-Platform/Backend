// Nhóm unit test cho TypeOrmUserDocumentWriterRepository: kiểm tra trạng thái provisioning, transaction ghi file và các invariant khi cập nhật.
// | STT | Test case               | Mục đích                                 | Các bước làm                                                   | Kết quả mong đợi                                |
// |-----|-------------------------|------------------------------------------|----------------------------------------------------------------|-------------------------------------------------|
// | 1   | Tạo provisioning        | Ghi trạng thái trước khi copy file       | Repository save document mới; gọi createProvisioningDocument   | Trả UUID, status provisioning và chưa có output |
// | 2   | Complete thành công     | Ghi StoredFile và chuyển READY nguyên tử | Transaction tạo file; cập nhật/reload document                 | Trả record READY có output và download URL      |
// | 3   | Provisioning bị mất     | Rollback complete khi thiếu document     | Transaction tìm không thấy provisioning row                    | Transaction reject, không trả document giả      |
// | 4   | Replace file thành công | Đổi reference và trả file cũ để cleanup  | Transaction lưu file mới, cập nhật document và xóa metadata cũ | Trả document mới cùng previousFile              |
// | 5   | Đánh dấu thất bại       | Lưu failure code ổn định                 | Gọi markDocumentFailed với documentId/code                     | Cập nhật status FAILED và failureCode           |

import { DataSource, EntityManager, Repository } from 'typeorm';
import { OfficeTemplate } from '@/database/entities/office-template.entity';
import { OfficeTemplateVersion } from '@/database/entities/office-template-version.entity';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import {
    FileStorageProvider,
    UserDocumentStatus,
} from '@/database/enums/office-template.enums';
import { TypeOrmUserDocumentWriterRepository } from '@/modules/document-template-library/infrastructure/repositories/write/typeorm-user-document-writer.repository';

describe('TypeOrmUserDocumentWriterRepository', () => {
    let target: TypeOrmUserDocumentWriterRepository;
    let mockUserDocuments: jest.Mocked<
        Pick<Repository<UserDocument>, 'create' | 'save' | 'update'>
    >;
    let mockManager: jest.Mocked<
        Pick<EntityManager, 'create' | 'save' | 'findOne' | 'delete'>
    >;
    let mockTransaction: jest.Mock;
    let mockDataSource: DataSource;

    beforeEach(() => {
        mockUserDocuments = {
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };
        mockManager = {
            create: jest.fn((_entity, values) => values as never),
            save: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
        };
        mockTransaction = jest.fn(
            (work: (manager: EntityManager) => Promise<unknown>) =>
                work(mockManager as unknown as EntityManager),
        );
        mockDataSource = {
            transaction: mockTransaction,
        } as unknown as DataSource;
        target = new TypeOrmUserDocumentWriterRepository(
            mockUserDocuments as unknown as Repository<UserDocument>,
            mockDataSource,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 xác nhận record được khởi tạo ở provisioning và không gắn output file sớm.
    it('should save a provisioning record and return its generated id', async () => {
        // Bước 1 - Arrange: repository tạo entity theo version nguồn và title.
        mockUserDocuments.create.mockReturnValue({
            sourceTemplateVersionId: 'version-1',
            title: 'Resume',
            status: UserDocumentStatus.PROVISIONING,
            outputFileId: null,
            failureCode: null,
        } as UserDocument);
        mockUserDocuments.save.mockResolvedValue({
            id: 'document-1',
        } as UserDocument);

        // Bước 2 - Act: tạo record ban đầu trước khi storage copy bắt đầu.
        const result = await target.createProvisioningDocument(
            'version-1',
            'Resume',
            'workspace-1',
        );

        // Bước 3 - Assert: ID được trả và entity lưu đúng trạng thái provisioning.
        expect(result).toBe('document-1');
        expect(mockUserDocuments.create).toHaveBeenCalledWith({
            sourceTemplateVersionId: 'version-1',
            anonymousWorkspaceId: 'workspace-1',
            title: 'Resume',
            status: UserDocumentStatus.PROVISIONING,
            outputFileId: null,
            failureCode: null,
        });
        expect(mockUserDocuments.save).toHaveBeenCalledTimes(1);
    });

    // Test 2 xác nhận StoredFile và UserDocument cùng transaction trước khi trả record READY.
    it('should complete a document and map the committed output file', async () => {
        // Bước 1 - Arrange: transaction manager trả file mới, document và bản reload có relations.
        const storedFile = {
            id: 'file-1',
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'user-documents',
            objectKey: 'documents/resume.docx',
            originalFilename: 'Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'hash',
        } as StoredFile;
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            title: 'Resume',
            status: UserDocumentStatus.PROVISIONING,
            outputFileId: null,
            failureCode: 'OLD_ERROR',
        });
        const reloadedDocument = Object.assign(new UserDocument(), {
            ...document,
            status: UserDocumentStatus.READY,
            outputFileId: 'file-1',
            failureCode: null,
            outputFile: storedFile,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            sourceTemplateVersion: Object.assign(new OfficeTemplateVersion(), {
                templateId: 'template-1',
                versionNumber: 1,
                template: Object.assign(new OfficeTemplate(), {
                    name: 'Resume template',
                }),
            }),
        });
        mockManager.save
            .mockResolvedValueOnce(storedFile)
            .mockResolvedValueOnce(document);
        mockManager.findOne
            .mockResolvedValueOnce(document)
            .mockResolvedValueOnce(reloadedDocument);

        // Bước 2 - Act: commit output metadata và trạng thái hoàn tất.
        const result = await target.completeDocument('document-1', {
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/resume.docx',
            originalFilename: 'Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'hash',
        });

        // Bước 3 - Assert: transaction gắn output, clear lỗi cũ và map URL tải.
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
                sha256: 'hash',
            },
            sourceTemplate: {
                id: 'template-1',
                name: 'Resume template',
                version: 1,
            },
        });
        expect(mockTransaction.mock.calls).toHaveLength(1);
        expect(mockManager.create).toHaveBeenCalledWith(
            StoredFile,
            expect.objectContaining({ provider: FileStorageProvider.LOCAL }),
        );
        expect(document.status).toBe(UserDocumentStatus.READY);
        expect(document.outputFileId).toBe('file-1');
        expect(document.failureCode).toBeNull();
    });

    // Test 3 transaction phải reject nếu provisioning biến mất sau khi file metadata đã được tạo.
    it('should fail the completion transaction when the provisioning row disappeared', async () => {
        // Bước 1 - Arrange: file save được nhưng lần đọc document trả null.
        mockManager.save.mockResolvedValue({ id: 'file-1' });
        mockManager.findOne.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: transaction reject để TypeORM rollback file record.
        await expect(
            target.completeDocument('missing-document', {
                provider: 'local',
                storageNamespace: 'user-documents',
                objectKey: 'documents/resume.docx',
                originalFilename: 'Resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'hash',
            }),
        ).rejects.toThrow('Provisioning user document disappeared.');
        expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    // Test 4 xác nhận file cũ chỉ bị xóa metadata trong cùng transaction thay file mới.
    it('should replace the file and return the previous reference for post-commit cleanup', async () => {
        // Bước 1 - Arrange: tài liệu READY đang có file cũ; manager trả file mới và reload.
        const oldFile = Object.assign(new StoredFile(), {
            id: 'old-file',
            provider: FileStorageProvider.LOCAL,
            storageNamespace: 'user-documents',
            objectKey: 'documents/old.docx',
            originalFilename: 'old.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '200',
            sha256: 'old-hash',
        });
        const document = Object.assign(new UserDocument(), {
            id: 'document-1',
            title: 'Resume',
            status: UserDocumentStatus.READY,
            outputFileId: 'old-file',
            outputFile: oldFile,
            failureCode: 'OLD_ERROR',
        });
        const savedFile = { id: 'new-file' } as StoredFile;
        const reloadedDocument = Object.assign(new UserDocument(), {
            ...document,
            outputFileId: 'new-file',
            outputFile: {
                ...oldFile,
                id: 'new-file',
                objectKey: 'documents/new.docx',
            },
            failureCode: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-03T00:00:00.000Z'),
            sourceTemplateVersion: Object.assign(new OfficeTemplateVersion(), {
                templateId: 'template-1',
                versionNumber: 1,
                template: null,
            }),
        });
        mockManager.findOne
            .mockResolvedValueOnce(document)
            .mockResolvedValueOnce(oldFile)
            .mockResolvedValueOnce(reloadedDocument);
        mockManager.save
            .mockResolvedValueOnce(savedFile)
            .mockResolvedValueOnce(document);
        mockManager.delete.mockResolvedValue({ affected: 1, raw: [] });

        // Bước 2 - Act: transaction đổi output_file_id và dọn metadata cũ.
        const result = await target.replaceDocumentFile('document-1', {
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/new.docx',
            originalFilename: 'new.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '300',
            sha256: 'new-hash',
        });

        // Bước 3 - Assert: previous reference được giữ để storage xóa sau commit.
        expect(result.previousFile).toEqual({
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/old.docx',
            originalFilename: 'old.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '200',
            sha256: 'old-hash',
        });
        expect(result.document.outputFile?.objectKey).toBe(
            'documents/new.docx',
        );
        expect(result.document.sourceTemplate.name).toBe('Mẫu đã lưu trữ');
        expect(document.outputFile).toBe(savedFile);
        expect(mockManager.delete).toHaveBeenCalledWith(StoredFile, 'old-file');
        expect(document.failureCode).toBeNull();
    });

    // Test 5 chặn update khi document thiếu hoặc chưa READY, trước khi tạo StoredFile mới.
    it.each([
        ['missing', null],
        [
            'not ready',
            Object.assign(new UserDocument(), {
                id: 'document-1',
                status: UserDocumentStatus.PROVISIONING,
                outputFile: null,
            }),
        ],
    ] as const)(
        'should reject replacement when the document is %s',
        async (_caseName, document) => {
            // Bước 1 - Arrange: manager trả null hoặc record không thỏa READY invariant.
            mockManager.findOne.mockResolvedValue(document);

            // Bước 2 - Act và Bước 3 - Assert: transaction reject trước khi tạo/lưu file mới.
            await expect(
                target.replaceDocumentFile('document-1', {
                    provider: 'local',
                    storageNamespace: 'user-documents',
                    objectKey: 'documents/new.docx',
                    originalFilename: 'new.docx',
                    mimeType:
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    sizeBytes: '300',
                    sha256: 'new-hash',
                }),
            ).rejects.toThrow();
            expect(mockManager.save).not.toHaveBeenCalled();
        },
    );

    // Test 6 failure code được lưu như enum status FAILED, không đưa exception nội bộ vào entity.
    it('should update the document status and stable failure code', async () => {
        // Bước 1 - Arrange: repository update trả promise hoàn tất.
        mockUserDocuments.update.mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: [],
        });

        // Bước 2 - Act: đánh dấu lỗi copy file.
        await target.markDocumentFailed(
            'document-1',
            'DOCUMENT_CREATION_FAILED',
        );

        // Bước 3 - Assert: status và mã lỗi ổn định được ghi đúng một lần.
        expect(mockUserDocuments.update).toHaveBeenCalledWith('document-1', {
            status: UserDocumentStatus.FAILED,
            failureCode: 'DOCUMENT_CREATION_FAILED',
        });
        expect(mockUserDocuments.update).toHaveBeenCalledTimes(1);
    });
});
