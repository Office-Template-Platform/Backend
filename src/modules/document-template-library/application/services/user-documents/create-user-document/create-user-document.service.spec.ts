// Nhóm unit test cho CreateUserDocumentService: xác nhận tạo bản DOCX độc lập và bù trừ trạng thái/file nếu một bước thất bại.
// | STT | Test case       | Mục đích                           | Các bước làm                                          | Kết quả mong đợi                                      |
// |-----|-----------------|------------------------------------|-------------------------------------------------------|-------------------------------------------------------|
// | 1   | Title hợp lệ    | Tạo bản sao với title đã chuẩn hóa | Reader trả source; provisioning; copy file; complete  | Trả summary, key mới và không sửa file mẫu            |
// | 2   | Title trống     | Dùng tên mẫu làm title mặc định    | Gửi title chỉ có khoảng trắng; reader trả source      | Provisioning và file dùng tên mẫu                     |
// | 3   | Không có mẫu    | Dừng trước khi tạo provisioning    | Reader trả null; gọi execute                          | Ném not-found, không gọi writer hoặc storage          |
// | 4   | Copy source lỗi | Đánh dấu provisioning thất bại     | Writer tạo provisioning; storage copy reject          | Ném lỗi tạo an toàn và gọi mark failed                |
// | 5   | Complete lỗi    | Dọn file mới và đánh dấu failed    | Copy thành công; writer complete reject               | Xóa bản sao, ghi trạng thái failed và báo lỗi an toàn |
// | 6   | Bù trừ cũng lỗi | Không để lỗi cleanup che lỗi chính | Complete reject; cleanup hoặc mark failed cũng reject | Vẫn ném UserDocumentCreationFailedError               |

import { Logger } from '@nestjs/common';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import type {
    DocumentTemplateReaderContract,
    DocumentTemplateSource,
} from '@/modules/document-template-library/application/contracts/document-template-reader.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import type { UserDocumentWriterContract } from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import { DocumentTemplateNotFoundError } from '@/modules/document-template-library/application/errors/document-template-not-found.error';
import { UserDocumentCreationFailedError } from '@/modules/document-template-library/application/errors/user-document-creation-failed.error';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';

describe('CreateUserDocumentService', () => {
    let target: CreateUserDocumentService;
    let mockTemplateReader: jest.Mocked<DocumentTemplateReaderContract>;
    let mockDocumentWriter: jest.Mocked<UserDocumentWriterContract>;
    let mockFileStorage: jest.Mocked<DocumentFileStorageContract>;
    let source: DocumentTemplateSource;
    let outputFile: StoredFileReference;
    let document: UserDocumentRecord;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        mockTemplateReader = {
            list: jest.fn(),
            listCategories: jest.fn(),
            findPublishedById: jest.fn(),
            findCurrentPreview: jest.fn(),
            findCurrentSource: jest.fn(),
        };
        mockDocumentWriter = {
            createProvisioningDocument: jest.fn(),
            completeDocument: jest.fn(),
            replaceDocumentFile: jest.fn(),
            markDocumentFailed: jest.fn(),
        };
        mockFileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        source = {
            templateId: 'template-1',
            templateName: 'Resume template',
            versionId: 'version-2',
            sourceFile: {
                provider: 'local',
                storageNamespace: 'document-template-assets',
                objectKey: 'document-templates/resume.docx',
                originalFilename: 'resume.docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: '512',
                sha256: 'source-hash',
            },
        };
        outputFile = {
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/new-copy.docx',
            originalFilename: 'My Resume.docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: '512',
            sha256: 'output-hash',
        };
        document = {
            id: 'document-1',
            title: 'My Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 2 },
        };
        mockTemplateReader.findCurrentSource.mockResolvedValue(source);
        mockDocumentWriter.createProvisioningDocument.mockResolvedValue(
            'document-1',
        );
        mockFileStorage.copyTemplateFile.mockResolvedValue(outputFile);
        mockDocumentWriter.completeDocument.mockResolvedValue(document);
        mockFileStorage.removeUserDocument.mockResolvedValue(undefined);
        mockDocumentWriter.markDocumentFailed.mockResolvedValue(undefined);
        target = new CreateUserDocumentService(
            mockTemplateReader,
            mockDocumentWriter,
            mockFileStorage,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    // Test 1 xác nhận file đầu ra dùng key UUID khác asset mẫu và response không lộ file reference.
    it('should create an independent document using the requested trimmed title', async () => {
        // Bước 1 - Arrange: tên nhập có khoảng trắng; các adapter trả source, provisioning và file mới.
        const expectedSummary = {
            id: 'document-1',
            title: 'My Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 2 },
        };

        // Bước 2 - Act: tạo tài liệu từ template đã xuất bản.
        const result = await target.execute(
            'template-1',
            'workspace-1',
            '  My Resume  ',
        );

        // Bước 3 - Assert: version được ghim, key mới là UUID và chỉ bản output được commit.
        expect(result).toEqual(expectedSummary);
        expect(
            mockDocumentWriter.createProvisioningDocument.mock.calls,
        ).toEqual([['version-2', 'My Resume', 'workspace-1']]);
        expect(mockFileStorage.copyTemplateFile.mock.calls).toEqual([
            [
                source.sourceFile,
                expect.stringMatching(/^[0-9a-f-]{36}\.docx$/),
                'My Resume.docx',
            ],
        ]);
        expect(mockDocumentWriter.completeDocument.mock.calls).toEqual([
            ['document-1', outputFile],
        ]);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([]);
        expect(mockDocumentWriter.markDocumentFailed.mock.calls).toEqual([]);
    });

    // Test 2 bảo đảm title rỗng sau trim dùng tên mẫu để không lưu tiêu đề trắng.
    it('should use the template name when the requested title is blank', async () => {
        // Bước 1 - Arrange: title chỉ chứa khoảng trắng.
        mockFileStorage.copyTemplateFile.mockResolvedValue(outputFile);

        // Bước 2 - Act: yêu cầu tạo bản sao với title blank.
        await target.execute('template-1', 'workspace-1', '   ');

        // Bước 3 - Assert: cả DB title và tên file hiển thị dùng template name.
        expect(
            mockDocumentWriter.createProvisioningDocument.mock.calls,
        ).toEqual([['version-2', 'Resume template', 'workspace-1']]);
        expect(mockFileStorage.copyTemplateFile.mock.calls).toEqual([
            [source.sourceFile, expect.any(String), 'Resume template.docx'],
        ]);
    });

    // Test 3 dừng trước khi tạo DB record hoặc file nếu reader không tìm thấy mẫu công khai.
    it('should throw not found without creating a document when the template is missing', async () => {
        // Bước 1 - Arrange: reader trả null do mẫu không public hoặc không tồn tại.
        mockTemplateReader.findCurrentSource.mockResolvedValue(null);

        // Bước 2 - Act và Bước 3 - Assert: báo 404 và không gọi writer/storage.
        await expect(
            target.execute('hidden-template', 'workspace-1'),
        ).rejects.toBeInstanceOf(DocumentTemplateNotFoundError);
        expect(
            mockDocumentWriter.createProvisioningDocument.mock.calls,
        ).toEqual([]);
        expect(mockFileStorage.copyTemplateFile.mock.calls).toEqual([]);
    });

    // Test 4 nếu copy thất bại thì provisioning được đánh dấu failed để không treo trạng thái.
    it('should mark provisioning failed and return a safe error when copying fails', async () => {
        // Bước 1 - Arrange: lưu provisioning thành công rồi storage từ chối copy.
        mockFileStorage.copyTemplateFile.mockRejectedValue(
            new Error('source file missing'),
        );

        // Bước 2 - Act và Bước 3 - Assert: lỗi nội bộ được thay bằng lỗi 500 ổn định.
        await expect(
            target.execute('template-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentCreationFailedError);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([]);
        expect(mockDocumentWriter.markDocumentFailed.mock.calls).toEqual([
            ['document-1', 'DOCUMENT_CREATION_FAILED'],
        ]);
    });

    // Test 5 nếu commit metadata lỗi thì file output vừa copy phải được dọn trước khi trả 500.
    it('should remove the copied file and mark failed when completion fails', async () => {
        // Bước 1 - Arrange: copy tạo file mới nhưng transaction hoàn tất bị lỗi.
        mockDocumentWriter.completeDocument.mockRejectedValue(
            new Error('database commit failed'),
        );

        // Bước 2 - Act và Bước 3 - Assert: không để orphan và báo lỗi đã chuẩn hóa.
        await expect(
            target.execute('template-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentCreationFailedError);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [outputFile],
        ]);
        expect(mockDocumentWriter.markDocumentFailed.mock.calls).toEqual([
            ['document-1', 'DOCUMENT_CREATION_FAILED'],
        ]);
    });

    // Test 6 lỗi cleanup/đánh dấu failed không được làm lộ hoặc thay lỗi tạo tài liệu.
    it('should keep the safe creation error when compensation also fails', async () => {
        // Bước 1 - Arrange: completion, file cleanup và cập nhật failed đều thất bại.
        mockDocumentWriter.completeDocument.mockRejectedValue(
            new Error('database commit failed'),
        );
        mockFileStorage.removeUserDocument.mockRejectedValue(
            new Error('disk unavailable'),
        );
        mockDocumentWriter.markDocumentFailed.mockRejectedValue(
            new Error('database unavailable'),
        );

        // Bước 2 - Act và Bước 3 - Assert: response vẫn chỉ chứa lỗi tạo đã làm sạch.
        await expect(
            target.execute('template-1', 'workspace-1'),
        ).rejects.toBeInstanceOf(UserDocumentCreationFailedError);
        expect(mockFileStorage.removeUserDocument.mock.calls).toEqual([
            [outputFile],
        ]);
        expect(mockDocumentWriter.markDocumentFailed.mock.calls).toHaveLength(
            1,
        );
    });
});
