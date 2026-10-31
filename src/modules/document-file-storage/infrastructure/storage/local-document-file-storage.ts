// Local adapter phục vụ asset DOCX đóng gói cùng API và lưu bản người dùng dưới storage root.
import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
    access,
    copyFile,
    mkdir,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type {
    DocumentFileStorageContract,
    StoredFileReference,
} from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import {
    getOfficeDocumentFormat,
    getOfficeDocumentFormatByExtension,
    OFFICE_DOCUMENT_FORMATS,
} from '@/modules/document-file-storage/application/types/office-document-format/office-document-format';

const TEMPLATE_ASSET_NAMESPACE = 'document-template-assets';
const PRESENTATION_ASSET_NAMESPACE = 'presentation-template-assets';
const USER_DOCUMENT_NAMESPACE = 'user-documents';
const USER_PRESENTATION_NAMESPACE = 'user-presentations';
const USER_OUTPUT_NAMESPACES = new Set([
    USER_DOCUMENT_NAMESPACE,
    USER_PRESENTATION_NAMESPACE,
]);

@Injectable()
// Adapter giữ asset mẫu bất biến và tách file DOCX/PPTX người dùng theo namespace.
export class LocalDocumentFileStorage implements DocumentFileStorageContract {
    // Xác thực loại asset rồi tạo bản sao độc lập; file DOCX/PPTX được ghi vào thư mục riêng theo định dạng.
    // Key đích phải giữ đúng extension nguồn, còn COPYFILE_EXCL ngăn retry ghi đè file đã có.
    // Nếu đọc metadata thất bại sau khi copy, adapter dọn phần output mới để không để lại file chưa được tham chiếu.
    async copyTemplateFile(
        source: StoredFileReference,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference> {
        const format = getOfficeDocumentFormat(source.mimeType);
        const sourceNamespaceMatches =
            (source.storageNamespace === TEMPLATE_ASSET_NAMESPACE &&
                source.mimeType === OFFICE_DOCUMENT_FORMATS.docx.mimeType) ||
            (source.storageNamespace === PRESENTATION_ASSET_NAMESPACE &&
                source.mimeType === OFFICE_DOCUMENT_FORMATS.pptx.mimeType);

        if (
            source.provider !== 'local' ||
            !sourceNamespaceMatches ||
            !format ||
            !destinationKey.endsWith(`.${format.extension}`)
        ) {
            throw new InternalServerErrorException(
                'Nguồn mẫu không phải file Office local hợp lệ.',
            );
        }

        const sourcePath = this.resolveAssetPath(source.objectKey);
        const destinationNamespace =
            format.extension === 'pptx'
                ? USER_PRESENTATION_NAMESPACE
                : USER_DOCUMENT_NAMESPACE;
        const destinationPath = this.resolveUserOutputPath(
            destinationNamespace,
            destinationKey,
        );
        let destinationCreated = false;

        try {
            await mkdir(dirname(destinationPath), {
                recursive: true,
            });
            // COPYFILE_EXCL giữ an toàn khi có va chạm tên hoặc request retry cùng key.
            await copyFile(
                sourcePath,
                destinationPath,
                constants.COPYFILE_EXCL,
            );
            destinationCreated = true;
            const fileStats = await stat(destinationPath);

            return {
                provider: 'local',
                storageNamespace: destinationNamespace,
                objectKey: destinationKey,
                originalFilename,
                mimeType: format.mimeType,
                sizeBytes: String(fileStats.size),
                sha256: await this.hashFile(destinationPath),
            };
        } catch (error) {
            // Không trả đường dẫn host cho client; thiếu asset là lỗi triển khai, còn tên trùng là lỗi retry.
            if (destinationCreated) {
                await unlink(destinationPath).catch(() => undefined);
            }
            if (this.isNodeError(error, 'ENOENT')) {
                throw new InternalServerErrorException(
                    'Không tìm thấy file Office nguồn của mẫu.',
                );
            }
            throw error;
        }
    }

    // Kiểm tra extension được hỗ trợ rồi ghi phiên bản đã chỉnh thành file mới trong namespace DOCX hoặc PPTX tương ứng.
    // File hiện hành không bị ghi đè; application chỉ chuyển database reference sau khi file mới ghi thành công.
    // Nếu key đã tồn tại, từ chối request để không ghi đè file của lần lưu khác đang chạy đồng thời.
    async saveEditedDocument(
        content: Buffer,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference> {
        const extension = destinationKey.split('.').pop()?.toLowerCase() ?? '';
        const format = getOfficeDocumentFormatByExtension(extension);
        if (!format) {
            throw new InternalServerErrorException(
                'Tên file Office đầu ra không hợp lệ.',
            );
        }

        const destinationNamespace =
            format.extension === 'pptx'
                ? USER_PRESENTATION_NAMESPACE
                : USER_DOCUMENT_NAMESPACE;
        const destinationPath = this.resolveUserOutputPath(
            destinationNamespace,
            destinationKey,
        );

        try {
            await mkdir(dirname(destinationPath), {
                recursive: true,
            });
            await writeFile(destinationPath, content, { flag: 'wx' });

            return {
                provider: 'local',
                storageNamespace: destinationNamespace,
                objectKey: destinationKey,
                originalFilename,
                mimeType: format.mimeType,
                sizeBytes: String(content.byteLength),
                sha256: createHash('sha256').update(content).digest('hex'),
            };
        } catch (error) {
            if (this.isNodeError(error, 'EEXIST')) {
                // Không xóa đích đã tồn tại vì file đó có thể thuộc request khác.
                throw new InternalServerErrorException(
                    'Không tạo được tên file tài liệu duy nhất.',
                );
            }
            await unlink(destinationPath).catch(() => undefined);
            throw error;
        }
    }

    // Mở stream sau khi xác minh tồn tại để Nest có thể trả lỗi trước khi bắt đầu response byte.
    async openReadStream(file: StoredFileReference): Promise<Readable> {
        const filePath = this.resolveReadablePath(file);

        try {
            await access(filePath, constants.R_OK);
        } catch (error) {
            if (this.isNodeError(error, 'ENOENT')) {
                throw new NotFoundException(
                    'Không tìm thấy file được yêu cầu.',
                );
            }
            throw new InternalServerErrorException(
                'Không thể đọc file được yêu cầu.',
            );
        }

        return createReadStream(filePath);
    }

    // Chỉ xóa file trong namespace đầu ra; asset mẫu không được phép xóa qua contract này.
    // Chấp nhận user-documents để cleanup các DOCX và PPTX cũ được lưu chung trước khi tách thư mục.
    async removeUserDocument(file: StoredFileReference): Promise<void> {
        if (
            file.provider !== 'local' ||
            !USER_OUTPUT_NAMESPACES.has(file.storageNamespace)
        ) {
            throw new InternalServerErrorException(
                'Chỉ được xóa file tài liệu do người dùng tạo.',
            );
        }

        try {
            await unlink(
                this.resolveUserOutputPath(
                    file.storageNamespace,
                    file.objectKey,
                ),
            );
        } catch (error) {
            if (!this.isNodeError(error, 'ENOENT')) {
                throw error;
            }
        }
    }

    // Dùng cwd làm root asset ổn định giữa Node host và Docker runtime image.
    private resolveAssetPath(objectKey: string): string {
        return this.resolveWithin(join(process.cwd(), 'assets'), objectKey);
    }

    // FILE_STORAGE_ROOT cho phép host và container chọn nơi lưu dữ liệu bền vững riêng.
    private get storageRoot(): string {
        return resolve(process.env.FILE_STORAGE_ROOT ?? 'storage');
    }

    // Chỉ ánh xạ hai namespace đầu ra đã biết; key vẫn được kiểm tra traversal trước khi truy cập filesystem.
    private resolveUserOutputPath(
        storageNamespace: string,
        objectKey: string,
    ): string {
        if (!USER_OUTPUT_NAMESPACES.has(storageNamespace)) {
            throw new InternalServerErrorException(
                'Namespace file đầu ra không được hỗ trợ.',
            );
        }

        return this.resolveWithin(
            join(this.storageRoot, storageNamespace),
            objectKey,
        );
    }

    // Đọc asset mẫu và cả hai namespace đầu ra; user-documents còn hỗ trợ reference PPTX cũ.
    private resolveReadablePath(file: StoredFileReference): string {
        if (file.provider !== 'local') {
            throw new InternalServerErrorException(
                'Storage provider của file chưa được cấu hình.',
            );
        }

        if (
            file.storageNamespace === TEMPLATE_ASSET_NAMESPACE ||
            file.storageNamespace === PRESENTATION_ASSET_NAMESPACE
        ) {
            return this.resolveAssetPath(file.objectKey);
        }
        if (USER_OUTPUT_NAMESPACES.has(file.storageNamespace)) {
            return this.resolveUserOutputPath(
                file.storageNamespace,
                file.objectKey,
            );
        }

        throw new InternalServerErrorException(
            'Namespace của file không được hỗ trợ.',
        );
    }

    // Chuẩn hóa đường dẫn và từ chối key tuyệt đối hoặc traversal ra ngoài root được cấp.
    private resolveWithin(root: string, objectKey: string): string {
        if (isAbsolute(objectKey)) {
            throw new InternalServerErrorException('Object key không hợp lệ.');
        }

        const resolvedRoot = resolve(root);
        const resolvedPath = resolve(resolvedRoot, objectKey);
        const pathFromRoot = relative(resolvedRoot, resolvedPath);

        if (
            pathFromRoot === '' ||
            pathFromRoot === '..' ||
            pathFromRoot.startsWith(`..${sep}`)
        ) {
            throw new InternalServerErrorException(
                'Object key vượt khỏi storage root.',
            );
        }

        return resolvedPath;
    }

    // Hash file sau khi copy để metadata có thể kiểm chứng nội dung đầu ra.
    private async hashFile(filePath: string): Promise<string> {
        const hash = createHash('sha256');

        for await (const chunk of createReadStream(filePath)) {
            hash.update(chunk as Buffer);
        }

        return hash.digest('hex');
    }

    // Nhận diện lỗi filesystem theo code để hoạt động cả khi Error đến từ realm khác.
    private isNodeError(
        error: unknown,
        code: string,
    ): error is NodeJS.ErrnoException {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string' &&
            error.code === code
        );
    }
}
