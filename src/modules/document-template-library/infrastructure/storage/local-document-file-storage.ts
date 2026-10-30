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
} from '@/modules/document-template-library/application/contracts/document-file-storage.contract';

const TEMPLATE_ASSET_NAMESPACE = 'document-template-assets';
const USER_DOCUMENT_NAMESPACE = 'user-documents';
const DOCX_MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
// Adapter giới hạn file vào asset đóng gói và namespace tài liệu người dùng.
export class LocalDocumentFileStorage implements DocumentFileStorageContract {
    // Sao chép source asset sang tên UUID riêng để thao tác chỉnh sửa không thể ghi ngược file mẫu.
    async copyTemplateFile(
        source: StoredFileReference,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference> {
        if (
            source.provider !== 'local' ||
            source.storageNamespace !== TEMPLATE_ASSET_NAMESPACE ||
            source.mimeType !== DOCX_MIME_TYPE ||
            !destinationKey.endsWith('.docx')
        ) {
            throw new InternalServerErrorException(
                'Nguồn mẫu không phải file DOCX local hợp lệ.',
            );
        }

        const sourcePath = this.resolveAssetPath(source.objectKey);
        const destinationPath = this.resolveUserDocumentPath(destinationKey);
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
                storageNamespace: USER_DOCUMENT_NAMESPACE,
                objectKey: destinationKey,
                originalFilename,
                mimeType: DOCX_MIME_TYPE,
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
                    'Không tìm thấy file DOCX nguồn của mẫu.',
                );
            }
            throw error;
        }
    }

    // Lưu file đã chỉnh vào key mới; không thay thế output hiện hành trước khi database commit.
    async saveEditedDocument(
        content: Buffer,
        destinationKey: string,
        originalFilename: string,
    ): Promise<StoredFileReference> {
        if (!destinationKey.endsWith('.docx')) {
            throw new InternalServerErrorException(
                'Tên file tài liệu đầu ra không hợp lệ.',
            );
        }

        const destinationPath = this.resolveUserDocumentPath(destinationKey);

        try {
            await mkdir(dirname(destinationPath), {
                recursive: true,
            });
            await writeFile(destinationPath, content, { flag: 'wx' });

            return {
                provider: 'local',
                storageNamespace: USER_DOCUMENT_NAMESPACE,
                objectKey: destinationKey,
                originalFilename,
                mimeType: DOCX_MIME_TYPE,
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

    // Chỉ xóa file thuộc namespace đầu ra; asset gốc được đóng gói là bất biến.
    async removeUserDocument(file: StoredFileReference): Promise<void> {
        if (
            file.provider !== 'local' ||
            file.storageNamespace !== USER_DOCUMENT_NAMESPACE
        ) {
            throw new InternalServerErrorException(
                'Chỉ được xóa file tài liệu do người dùng tạo.',
            );
        }

        try {
            await unlink(this.resolveUserDocumentPath(file.objectKey));
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

    // Chặn mọi key thoát khỏi thư mục user-documents trước khi filesystem nhận đường dẫn.
    private resolveUserDocumentPath(objectKey: string): string {
        return this.resolveWithin(
            join(this.storageRoot, USER_DOCUMENT_NAMESPACE),
            objectKey,
        );
    }

    // Chỉ đọc hai namespace hợp lệ; provider chưa hỗ trợ được từ chối thay vì đoán storage.
    private resolveReadablePath(file: StoredFileReference): string {
        if (file.provider !== 'local') {
            throw new InternalServerErrorException(
                'Storage provider của file chưa được cấu hình.',
            );
        }

        if (file.storageNamespace === TEMPLATE_ASSET_NAMESPACE) {
            return this.resolveAssetPath(file.objectKey);
        }
        if (file.storageNamespace === USER_DOCUMENT_NAMESPACE) {
            return this.resolveUserDocumentPath(file.objectKey);
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
