// Nhóm unit test cho DownloadUserDocumentController: xác nhận DOCX được stream dạng attachment với filename UTF-8 an toàn.
// | STT | Test case     | Mục đích                                | Các bước làm                              | Kết quả mong đợi                                 |
// |-----|---------------|-----------------------------------------|-------------------------------------------|--------------------------------------------------|
// | 1   | File sẵn sàng | Trả attachment đúng MIME và tên Unicode | Use case trả file/name; storage mở stream | StreamableFile có DOCX MIME và filename RFC 5987 |

import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { DownloadUserDocumentService } from '@/modules/user-document-management/application/services/user-documents/download-user-document/download-user-document.service';
import { DownloadUserDocumentController } from '@/modules/user-document-management/presentation/controllers/download-user-document/download-user-document.controller';

describe('DownloadUserDocumentController', () => {
    let target: DownloadUserDocumentController;
    let mockDownloadDocument: jest.Mocked<
        Pick<DownloadUserDocumentService, 'execute'>
    >;
    let mockFileStorage: jest.Mocked<DocumentFileStorageContract>;
    const docxMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    beforeEach(() => {
        mockDownloadDocument = { execute: jest.fn() };
        mockFileStorage = {
            copyTemplateFile: jest.fn(),
            saveEditedDocument: jest.fn(),
            openReadStream: jest.fn(),
            removeUserDocument: jest.fn(),
        };
        target = new DownloadUserDocumentController(
            mockDownloadDocument as unknown as DownloadUserDocumentService,
            mockFileStorage,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 filename được encode để giữ Unicode an toàn trong Content-Disposition.
    it('should stream a DOCX attachment with an encoded UTF-8 filename', async () => {
        // Bước 1 - Arrange: use case trả file sẵn sàng và storage mở nội dung nhị phân.
        const file: StoredFileReference = {
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: 'documents/document-1.docx',
            originalFilename: 'Résumé final.docx',
            mimeType: docxMimeType,
            sizeBytes: '500',
            sha256: 'hash',
        };
        const stream = Readable.from([Buffer.from('docx bytes')]);
        mockDownloadDocument.execute.mockResolvedValue({
            file,
            filename: 'Résumé final.docx',
        });
        mockFileStorage.openReadStream.mockResolvedValue(stream);

        // Bước 2 - Act: gọi endpoint GET /user-documents/:documentId/download.
        const result = await target.download('document-1', 'workspace-1');

        // Bước 3 - Assert: response giữ binary stream, MIME và RFC 5987 filename.
        expect(result).toBeInstanceOf(StreamableFile);
        expect(result.getHeaders()).toEqual({
            type: docxMimeType,
            disposition:
                'attachment; filename="document.docx"; filename*=UTF-8\'\'R%C3%A9sum%C3%A9%20final.docx',
        });
        expect(result.getStream()).toBe(stream);
        expect(mockDownloadDocument.execute.mock.calls).toEqual([
            ['document-1', 'workspace-1'],
        ]);
        expect(mockFileStorage.openReadStream.mock.calls).toEqual([[file]]);
    });
});
