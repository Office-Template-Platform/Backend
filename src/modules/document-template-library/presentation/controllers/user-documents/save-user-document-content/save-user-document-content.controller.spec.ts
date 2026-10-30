// Nhóm unit test cho SaveUserDocumentContentController: kiểm tra upload multipart trước khi giao DOCX hợp lệ cho use case.
// | STT | Test case          | Mục đích                               | Các bước làm                          | Kết quả mong đợi                         |
// |-----|--------------------|----------------------------------------|---------------------------------------|------------------------------------------|
// | 1   | Thiếu file         | Chặn request multipart không có file   | Gọi saveContent với file undefined    | Ném HTTP 400, service không được gọi     |
// | 2   | File vượt giới hạn | Chặn file trên 25 MiB                  | Gửi uploaded file quá ngưỡng          | Ném HTTP 413, service không được gọi     |
// | 3   | DOCX hợp lệ        | Chuyển bytes và filename sang use case | Gửi file DOCX hợp lệ; gọi saveContent | Service nhận đúng ID, buffer và tên file |

import {
    BadRequestException,
    PayloadTooLargeException,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { SaveUserDocumentContentService } from '@/modules/document-template-library/application/services/user-documents/save-user-document-content/save-user-document-content.service';
import { SaveUserDocumentContentController } from '@/modules/document-template-library/presentation/controllers/user-documents/save-user-document-content/save-user-document-content.controller';

describe('SaveUserDocumentContentController', () => {
    let target: SaveUserDocumentContentController;
    let mockSaveContent: jest.Mocked<
        Pick<SaveUserDocumentContentService, 'executeForWorkspace'>
    >;
    const docxMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    beforeEach(() => {
        mockSaveContent = { executeForWorkspace: jest.fn() };
        target = new SaveUserDocumentContentController(
            mockSaveContent as unknown as SaveUserDocumentContentService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 thiếu file multipart bị dừng trước khi use case nhận yêu cầu.
    it('should reject a missing upload before calling the save service', async () => {
        // Bước 1 - Arrange: request không có multipart field `file`.
        const documentId = 'document-1';

        // Bước 2 - Act và Bước 3 - Assert: controller trả HTTP 400, không gọi application.
        await expect(
            target.saveContent(documentId, undefined, 'workspace-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockSaveContent.executeForWorkspace.mock.calls).toEqual([]);
    });

    // Test 2 handler giữ giới hạn 25 MiB kể cả khi cấu hình upload middleware thay đổi.
    it('should reject files larger than 25 MiB before saving', async () => {
        // Bước 1 - Arrange: file vượt ngưỡng nhưng có metadata đủ để handler kiểm tra size.
        const oversizedFile = {
            originalname: 'Resume.docx',
            mimetype: docxMimeType,
            size: 25 * 1024 * 1024 + 1,
            buffer: Buffer.from('unused'),
        };

        // Bước 2 - Act và Bước 3 - Assert: trả HTTP 413 trước khi kiểm tra bytes.
        await expect(
            target.saveContent('document-1', oversizedFile, 'workspace-1'),
        ).rejects.toBeInstanceOf(PayloadTooLargeException);
        expect(mockSaveContent.executeForWorkspace.mock.calls).toEqual([]);
    });

    // Test 3 MIME và extension do client khai báo phải khớp DOCX trước khi đọc package.
    it.each([
        ['MIME không phải DOCX', { mimetype: 'application/pdf' }],
        ['đuôi file không phải DOCX', { originalname: 'Resume.pdf' }],
    ])('should reject an upload with %s', async (_caseName, override) => {
        // Bước 1 - Arrange: metadata sai nhưng buffer có signature và part OOXML.
        const file = {
            originalname: 'Resume.docx',
            mimetype: docxMimeType,
            size: 100,
            buffer: Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                Buffer.from('[Content_Types].xml word/document.xml'),
            ]),
            ...override,
        };

        // Bước 2 - Act và Bước 3 - Assert: metadata client không đạt thì trả HTTP 415.
        await expect(
            target.saveContent('document-1', file, 'workspace-1'),
        ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
        expect(mockSaveContent.executeForWorkspace.mock.calls).toEqual([]);
    });

    // Test 4 xác minh signature ZIP và hai part OOXML cần có trong tài liệu DOCX.
    it.each([
        [
            'header ZIP sai',
            Buffer.from('not zip [Content_Types].xml word/document.xml'),
        ],
        [
            'thiếu content types',
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                Buffer.from('word/document.xml'),
            ]),
        ],
        [
            'thiếu document XML',
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                Buffer.from('[Content_Types].xml'),
            ]),
        ],
    ])('should reject an upload with %s', async (_caseName, buffer) => {
        // Bước 1 - Arrange: MIME/đuôi đúng nhưng ZIP signature hoặc part OOXML sai.
        const file = {
            originalname: 'Resume.docx',
            mimetype: docxMimeType,
            size: buffer.byteLength,
            buffer,
        };

        // Bước 2 - Act và Bước 3 - Assert: không chuyển package sai sang use case.
        await expect(
            target.saveContent('document-1', file, 'workspace-1'),
        ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
        expect(mockSaveContent.executeForWorkspace.mock.calls).toEqual([]);
    });

    // Test 5 DOCX hợp lệ được chuyển nguyên buffer và filename qua application boundary.
    it('should pass a valid DOCX upload to the save use case', async () => {
        // Bước 1 - Arrange: tạo payload có ZIP header và hai part OOXML bắt buộc.
        const buffer = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            Buffer.from('[Content_Types].xml word/document.xml'),
        ]);
        const file = {
            originalname: 'Resume.docx',
            mimetype: docxMimeType,
            size: buffer.byteLength,
            buffer,
        };
        const expected = {
            id: 'document-1',
            title: 'Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            outputFile: null,
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        } satisfies UserDocumentRecord;
        mockSaveContent.executeForWorkspace.mockResolvedValue(expected);

        // Bước 2 - Act: gửi upload đã xác thực đến endpoint PUT content.
        const result = await target.saveContent(
            'document-1',
            file,
            'workspace-1',
        );

        // Bước 3 - Assert: trả result và không làm đổi bytes hay tên file.
        expect(result).toEqual(expected);
        expect(mockSaveContent.executeForWorkspace.mock.calls).toEqual([
            ['document-1', 'workspace-1', buffer, 'Resume.docx'],
        ]);
        expect(mockSaveContent.executeForWorkspace).toHaveBeenCalledTimes(1);
    });
});
