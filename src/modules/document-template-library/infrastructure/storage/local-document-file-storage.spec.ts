// Nhóm unit test cho LocalDocumentFileStorage: kiểm tra copy/write/hash/stream và ranh giới path an toàn.
// | STT | Test case              | Mục đích                              | Các bước làm                                  | Kết quả mong đợi                            |
// |-----|------------------------|---------------------------------------|-----------------------------------------------|---------------------------------------------|
// | 1   | Copy template hợp lệ   | Tạo bản sao output có hash            | Copy asset vào temp root                      | Nội dung giống, namespace output riêng      |
// | 2   | Source sai contract    | Chặn file không phải asset DOCX       | Gửi provider/namespace/MIME sai               | Ném InternalServerErrorException            |
// | 3   | Path traversal         | Không đọc ngoài asset root             | Gửi key `../../...`                           | Từ chối trước filesystem                    |
// | 4   | Destination trùng      | Không ghi đè file đã có                | Copy hai lần cùng key                         | Lần hai lỗi, bytes ban đầu giữ nguyên        |
// | 5   | Save DOCX              | Ghi buffer và hash chính xác           | Gọi saveEditedDocument                         | Bytes, size và SHA-256 khớp                  |
// | 6   | Key sai đuôi           | Chỉ nhận output `.docx`                | Gọi save với `.txt`                           | Ném InternalServerErrorException            |
// | 7   | Read stream            | Mở file đúng namespace                 | Ghi file rồi mở stream                        | Đọc lại đúng bytes                          |
// | 8   | Namespace/provider lạ  | Fail closed khi đọc/xóa                | Gửi reference không hỗ trợ                    | Read/xóa bị từ chối                         |
// | 9   | Xóa file thiếu         | Cleanup lặp lại an toàn                 | Xóa key đã không tồn tại                      | Hoàn tất không lỗi                          |
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InternalServerErrorException } from '@nestjs/common';
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { LocalDocumentFileStorage } from '@/modules/document-template-library/infrastructure/storage/local-document-file-storage';

describe('LocalDocumentFileStorage', () => {
    let target: LocalDocumentFileStorage;
    let temporaryStorageRoot: string;
    let originalStorageRoot: string | undefined;
    const docxMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const sourceFile: StoredFileReference = {
        provider: 'local',
        storageNamespace: 'document-template-assets',
        objectKey: 'document-templates/cover-letter.docx',
        originalFilename: 'cover-letter.docx',
        mimeType: docxMimeType,
        sizeBytes: '100',
        sha256: null,
    };

    beforeEach(async () => {
        originalStorageRoot = process.env.FILE_STORAGE_ROOT;
        temporaryStorageRoot = await mkdtemp(
            join(tmpdir(), 'office-template-storage-'),
        );
        process.env.FILE_STORAGE_ROOT = temporaryStorageRoot;
        target = new LocalDocumentFileStorage();
    });

    afterEach(async () => {
        if (originalStorageRoot === undefined) {
            delete process.env.FILE_STORAGE_ROOT;
        } else {
            process.env.FILE_STORAGE_ROOT = originalStorageRoot;
        }

        await rm(temporaryStorageRoot, { recursive: true, force: true });
    });

    // Test 1 xác nhận file mẫu được copy sang namespace riêng và hash/size lấy từ bytes thực.
    it('should copy a valid template into a separate user document key', async () => {
        // Bước 1 - Arrange: nguồn là DOCX asset bất biến đã được đóng gói cùng API.
        const destinationKey = 'documents/new-copy.docx';

        // Bước 2 - Act: copy template sang storage root tạm của test.
        const result = await target.copyTemplateFile(
            sourceFile,
            destinationKey,
            'My copy.docx',
        );

        // Bước 3 - Assert: output có key/namespace riêng và metadata khớp file đã copy.
        const copiedBytes = await readFile(
            join(temporaryStorageRoot, 'user-documents', destinationKey),
        );
        const sourceBytes = await readFile(
            join(process.cwd(), 'assets', sourceFile.objectKey),
        );
        expect(result).toEqual({
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: destinationKey,
            originalFilename: 'My copy.docx',
            mimeType: docxMimeType,
            sizeBytes: String(sourceBytes.byteLength),
            sha256: createHash('sha256').update(sourceBytes).digest('hex'),
        });
        expect(copiedBytes).toEqual(sourceBytes);
        expect(result.objectKey).not.toBe(sourceFile.objectKey);
    });

    // Test 2 chặn provider, namespace, MIME hoặc suffix sai trước khi copy asset.
    it.each([
        ['provider khác', { provider: 's3' as const }],
        ['namespace khác', { storageNamespace: 'user-documents' }],
        ['MIME khác', { mimeType: 'application/pdf' }],
    ])(
        'should reject a template source with %s',
        async (_caseName, override) => {
            // Bước 1 - Arrange: thay một thuộc tính nguồn để phá contract DOCX asset.
            const invalidSource = { ...sourceFile, ...override };

            // Bước 2 - Act và Bước 3 - Assert: adapter từ chối trước khi ghi file đích.
            await expect(
                target.copyTemplateFile(
                    invalidSource,
                    'documents/new-copy.docx',
                    'Copy.docx',
                ),
            ).rejects.toBeInstanceOf(InternalServerErrorException);
            await expect(
                readFile(
                    join(
                        temporaryStorageRoot,
                        'user-documents',
                        'documents/new-copy.docx',
                    ),
                ),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        },
    );

    // Test 3 bảo đảm object key không thoát ra ngoài thư mục assets được cấp.
    it('should reject template path traversal before copying', async () => {
        // Bước 1 - Arrange: key thử đi ngược từ assets tới file ngoài root.
        const traversalSource = {
            ...sourceFile,
            objectKey: '../../package.json',
        };

        // Bước 2 - Act và Bước 3 - Assert: key traversal bị từ chối.
        await expect(
            target.copyTemplateFile(
                traversalSource,
                'documents/blocked.docx',
                'Blocked.docx',
            ),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    // Test 4 COPYFILE_EXCL bảo vệ output đã tồn tại khỏi request retry ghi đè.
    it('should not overwrite a destination file that already exists', async () => {
        // Bước 1 - Arrange: tạo output đầu tiên với key sẽ được retry.
        const destinationKey = 'documents/collision.docx';
        await target.copyTemplateFile(sourceFile, destinationKey, 'First.docx');
        const originalBytes = await readFile(
            join(temporaryStorageRoot, 'user-documents', destinationKey),
        );

        // Bước 2 - Act: thử copy lần nữa với cùng key.
        await expect(
            target.copyTemplateFile(sourceFile, destinationKey, 'Second.docx'),
        ).rejects.toMatchObject({ code: 'EEXIST' });

        // Bước 3 - Assert: file đầu tiên vẫn nguyên bytes sau va chạm key.
        await expect(
            readFile(
                join(temporaryStorageRoot, 'user-documents', destinationKey),
            ),
        ).resolves.toEqual(originalBytes);
    });

    // Test 5 kiểm tra buffer được ghi atomically bằng wx cùng size và SHA-256 chính xác.
    it('should save edited DOCX bytes and return their exact digest', async () => {
        // Bước 1 - Arrange: chuẩn bị nội dung đã chỉnh và key mới.
        const content = Buffer.from('edited document bytes');
        const destinationKey = 'documents/edited.docx';

        // Bước 2 - Act: ghi nội dung vào namespace tài liệu người dùng.
        const result = await target.saveEditedDocument(
            content,
            destinationKey,
            'Edited.docx',
        );

        // Bước 3 - Assert: metadata hash/size khớp bytes và output nằm trong user namespace.
        expect(result).toEqual({
            provider: 'local',
            storageNamespace: 'user-documents',
            objectKey: destinationKey,
            originalFilename: 'Edited.docx',
            mimeType: docxMimeType,
            sizeBytes: String(content.byteLength),
            sha256: createHash('sha256').update(content).digest('hex'),
        });
        await expect(
            readFile(
                join(temporaryStorageRoot, 'user-documents', destinationKey),
            ),
        ).resolves.toEqual(content);
    });

    // Test 6 chỉ cho phép file đầu ra có suffix .docx trước khi chạm filesystem.
    it('should reject an output key that is not a DOCX file', async () => {
        // Bước 1 - Arrange: dùng đuôi không được phép.
        const content = Buffer.from('not a docx');

        // Bước 2 - Act và Bước 3 - Assert: adapter báo lỗi nội bộ an toàn.
        await expect(
            target.saveEditedDocument(
                content,
                'documents/file.txt',
                'file.txt',
            ),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    // Test 7 xác nhận mở stream trả chính xác bytes của file được tham chiếu.
    it('should open a readable stream for a supported stored file', async () => {
        // Bước 1 - Arrange: tạo output file hợp lệ qua storage adapter.
        const content = Buffer.from('stream me');
        const file = await target.saveEditedDocument(
            content,
            'documents/stream.docx',
            'Stream.docx',
        );

        // Bước 2 - Act: mở stream sau khi adapter xác minh quyền đọc file.
        const stream = await target.openReadStream(file);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }

        // Bước 3 - Assert: stream có đúng bytes đã lưu.
        expect(Buffer.concat(chunks)).toEqual(content);
    });

    // Test 8 provider/namespace không hỗ trợ bị chặn trước thao tác đọc hoặc xóa.
    it('should reject references outside the local user and template namespaces', async () => {
        // Bước 1 - Arrange: reference trỏ tới provider S3 chưa được cấu hình.
        const unsupportedFile: StoredFileReference = {
            ...sourceFile,
            provider: 's3',
            storageNamespace: 'remote-bucket',
        };

        // Bước 2 - Act và Bước 3 - Assert: read và remove đều fail closed.
        await expect(
            target.openReadStream(unsupportedFile),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(
            target.removeUserDocument(unsupportedFile),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    // Test 9 xóa idempotent để cleanup sau lỗi có thể retry mà không làm hỏng request khác.
    it('should treat removal of an already missing user file as successful cleanup', async () => {
        // Bước 1 - Arrange: chuẩn bị reference output chưa có trên đĩa.
        const missingFile: StoredFileReference = {
            ...sourceFile,
            storageNamespace: 'user-documents',
            objectKey: 'documents/already-removed.docx',
        };

        // Bước 2 - Act: gọi cleanup cho file đã mất.
        await target.removeUserDocument(missingFile);

        // Bước 3 - Assert: ENOENT được coi là đã dọn xong.
        await expect(
            readFile(
                join(
                    temporaryStorageRoot,
                    'user-documents',
                    missingFile.objectKey,
                ),
            ),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
