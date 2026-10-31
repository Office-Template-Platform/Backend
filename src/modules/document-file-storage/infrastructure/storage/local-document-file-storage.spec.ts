// Nhóm unit test cho LocalDocumentFileStorage: kiểm tra phân vùng DOCX/PPTX, tương thích file cũ và ranh giới filesystem.
// | STT | Test case                    | Mục đích                                  | Các bước làm                                  | Kết quả mong đợi                                |
// |-----|------------------------------|-------------------------------------------|-----------------------------------------------|-------------------------------------------------|
// | 1   | Copy template DOCX           | Tạo bản sao vào namespace tài liệu         | Copy DOCX; đọc metadata và bytes              | Namespace là user-documents, hash và bytes đúng |
// | 2   | Nguồn template không hợp lệ  | Chặn provider, namespace hoặc MIME sai    | Thay thuộc tính nguồn; gọi copy               | Ném lỗi trước khi tạo file                      |
// | 3   | Path traversal               | Chặn key thoát khỏi asset root            | Gửi objectKey traversal; gọi copy             | Ném lỗi an toàn                                  |
// | 4   | Destination đã tồn tại       | Không ghi đè file của request khác        | Copy hai lần cùng key                         | Từ chối lần sau, bytes cũ còn nguyên            |
// | 5   | Lưu DOCX đã sửa              | Ghi file vào vùng DOCX                     | Lưu buffer .docx; đọc lại file                | Namespace user-documents và digest đúng         |
// | 6   | Extension không hỗ trợ       | Chặn file đầu ra không phải Office         | Lưu key .txt                                  | Ném lỗi validation                              |
// | 7   | Mở file hợp lệ               | Stream bytes từ namespace đầu ra           | Lưu DOCX; gọi openReadStream                  | Stream trả đúng bytes                           |
// | 8   | Namespace không hợp lệ       | Chặn provider/namespace chưa hỗ trợ        | Mở và xóa reference lạ                        | Ném lỗi, không truy cập ngoài root              |
// | 9   | File cleanup đã mất          | Giữ cleanup idempotent                     | Xóa reference không còn file                 | Hoàn tất không lỗi                              |
// | 10  | Copy template PPTX           | Tạo bản sao vào namespace trình chiếu      | Copy PPTX; đọc metadata và bytes              | Namespace user-presentations, checksum đúng     |
// | 11  | Lưu PPTX đã sửa              | Ghi, đọc và xóa trong vùng trình chiếu      | Lưu PPTX; mở stream; remove                   | Mọi thao tác dùng user-presentations            |
// | 12  | PPTX theo đường dẫn cũ       | Giữ tương thích file lưu trước khi tách    | Đọc PPTX trong user-documents                 | File legacy vẫn đọc được                        |

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InternalServerErrorException } from '@nestjs/common';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { LocalDocumentFileStorage } from '@/modules/document-file-storage/infrastructure/storage/local-document-file-storage';

describe('LocalDocumentFileStorage', () => {
    let target: LocalDocumentFileStorage;
    let temporaryStorageRoot: string;
    let originalStorageRoot: string | undefined;
    const docxMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // Dùng asset đang được đóng gói; danh sách mẫu cũ không còn cover-letter.docx.
    const sourceFile: StoredFileReference = {
        provider: 'local',
        storageNamespace: 'document-template-assets',
        objectKey: 'document-templates/Tờ bướm mời dự tiệc/file.docx',
        originalFilename: 'file.docx',
        mimeType: docxMimeType,
        sizeBytes: '100',
        sha256: null,
    };
    const presentationSourceFile: StoredFileReference = {
        provider: 'local',
        storageNamespace: 'presentation-template-assets',
        objectKey:
            'presentation-templates/Sách nhỏ quảng cáo màu vàng/file.pptx',
        originalFilename: 'file.pptx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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

    // Test 6 chỉ cho phép file đầu ra có extension Office được hỗ trợ trước khi chạm filesystem.
    it('should reject an output key that is not a supported Office file', async () => {
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

    // Test 10 copy PPTX vào user-presentations để presentation không dùng chung thư mục với DOCX.
    it('should copy a valid presentation template into a separate PPTX file', async () => {
        // Bước 1 - Arrange: source là PPTX asset đã có trong thư viện mẫu.
        const destinationKey = 'presentations/new-copy.pptx';

        // Bước 2 - Act: copy source sang vùng trình chiếu với key độc lập.
        const result = await target.copyTemplateFile(
            presentationSourceFile,
            destinationKey,
            'Bài thuyết trình riêng.pptx',
        );

        // Bước 3 - Assert: output là file PPTX riêng và checksum khớp bytes thực tế.
        const sourceBytes = await readFile(
            join(process.cwd(), 'assets', presentationSourceFile.objectKey),
        );
        const copiedBytes = await readFile(
            join(temporaryStorageRoot, 'user-presentations', destinationKey),
        );
        expect(result).toEqual({
            provider: 'local',
            storageNamespace: 'user-presentations',
            objectKey: destinationKey,
            originalFilename: 'Bài thuyết trình riêng.pptx',
            mimeType: presentationSourceFile.mimeType,
            sizeBytes: String(sourceBytes.byteLength),
            sha256: createHash('sha256').update(sourceBytes).digest('hex'),
        });
        expect(copiedBytes).toEqual(sourceBytes);
    });

    // Test 11 bảo đảm callback lưu PPTX mới, tải lại và cleanup đều dùng namespace trình chiếu.
    it('should save edited PPTX bytes in the separate presentation namespace', async () => {
        // Bước 1 - Arrange: chuẩn bị nội dung PPTX đã chỉnh với key mới.
        const content = Buffer.from('edited presentation bytes');
        const destinationKey = 'presentations/edited.pptx';

        // Bước 2 - Act: lưu bản chỉnh sửa, đọc lại rồi xóa đúng file vừa tạo.
        const result = await target.saveEditedDocument(
            content,
            destinationKey,
            'Edited.pptx',
        );
        const storedPath = join(
            temporaryStorageRoot,
            'user-presentations',
            destinationKey,
        );
        const stream = await target.openReadStream(result);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }
        await target.removeUserDocument(result);

        // Bước 3 - Assert: metadata giữ PPTX, stream có bytes đúng và remove đã xóa file mới.
        expect(result.storageNamespace).toBe('user-presentations');
        expect(result.mimeType).toBe(presentationSourceFile.mimeType);
        expect(Buffer.concat(chunks)).toEqual(content);
        await expect(readFile(storedPath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    // Test 12 bảo đảm các PPTX cũ trong user-documents tiếp tục mở được sau khi tách nơi lưu mới.
    it('should keep reading legacy PPTX files from the old shared namespace', async () => {
        // Bước 1 - Arrange: dựng reference và bytes theo đường dẫn đã dùng trước khi tách namespace.
        const legacyKey = 'presentations/legacy.pptx';
        const legacyPath = join(
            temporaryStorageRoot,
            'user-documents',
            legacyKey,
        );
        const legacyContent = Buffer.from('legacy presentation bytes');
        await mkdir(
            join(temporaryStorageRoot, 'user-documents', 'presentations'),
            {
                recursive: true,
            },
        );
        await writeFile(legacyPath, legacyContent);

        // Bước 2 - Act: mở legacy reference; namespace lưu trong DB giữ nguyên đường dẫn vật lý cũ.
        const stream = await target.openReadStream({
            ...presentationSourceFile,
            storageNamespace: 'user-documents',
            objectKey: legacyKey,
        });
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }

        // Bước 3 - Assert: adapter tiếp tục trả bytes cho dữ liệu PPTX lịch sử.
        expect(Buffer.concat(chunks)).toEqual(legacyContent);
    });
});
