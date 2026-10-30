// TypeORM write adapter cho provisioning, hoàn tất, thay file và rollback trạng thái tài liệu.
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StoredFile } from '@/database/entities/stored-file.entity';
import { UserDocument } from '@/database/entities/user-document.entity';
import {
    FileStorageProvider,
    UserDocumentStatus,
} from '@/database/enums/office-template.enums';
import type {
    ExpectedUserDocumentFile,
    NewUserDocumentFile,
    ReplacedUserDocumentFile,
    UserDocumentWriterContract,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import {
    toStoredFileReference,
    toUserDocumentRecord,
} from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';
import { UserDocumentRevisionConflictError } from '@/modules/document-template-library/application/errors/user-document-revision-conflict.error';

@Injectable()
// Adapter giữ SQL và transaction cho mọi chuyển trạng thái/file metadata của user document.
export class TypeOrmUserDocumentWriterRepository implements UserDocumentWriterContract {
    // Repository tạo provisioning; DataSource bảo đảm file record và document cùng commit.
    constructor(
        @InjectRepository(UserDocument)
        private readonly userDocuments: Repository<UserDocument>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    // Ghi provisioning trước khi copy để tiến trình lỗi vẫn có thể được truy vết.
    async createProvisioningDocument(
        sourceTemplateVersionId: string,
        title: string,
        workspaceId: string,
    ): Promise<string> {
        const document = this.userDocuments.create({
            sourceTemplateVersionId,
            anonymousWorkspaceId: workspaceId,
            title,
            status: UserDocumentStatus.PROVISIONING,
            outputFileId: null,
            failureCode: null,
        });
        const savedDocument = await this.userDocuments.save(document);

        return savedDocument.id;
    }

    // Tạo StoredFile và chuyển tài liệu sang READY trong cùng transaction.
    async completeDocument(
        documentId: string,
        outputFile: NewUserDocumentFile,
    ): Promise<UserDocumentRecord> {
        return this.dataSource.transaction(async (manager) => {
            const file = manager.create(StoredFile, {
                ...outputFile,
                provider: this.toStorageProvider(outputFile.provider),
            });
            const savedFile = await manager.save(file);
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId },
                // Đồng bộ với xóa mềm: nếu xóa thắng, bản ghi không được hoàn tất thành tài liệu ẩn còn file mồ côi.
                lock: { mode: 'pessimistic_write' },
            });

            if (!document) {
                throw new Error('Provisioning user document disappeared.');
            }

            document.outputFileId = savedFile.id;
            document.status = UserDocumentStatus.READY;
            document.failureCode = null;

            const savedDocument = await manager.save(document);
            const completeDocument = await manager.findOne(UserDocument, {
                where: { id: savedDocument.id },
                relations: {
                    outputFile: true,
                    sourceTemplateVersion: { template: true },
                },
            });

            if (!completeDocument) {
                throw new Error(
                    'Completed user document could not be reloaded.',
                );
            }

            return toUserDocumentRecord(completeDocument);
        });
    }

    // Bước 1 khóa row tài liệu; xác nhận READY và revision nếu caller truyền file kỳ vọng.
    // Callback cũ bị từ chối trước khi tạo metadata; transaction lỗi giữ nguyên file hiện hành.
    // Bước 2 tạo metadata mới, chuyển FK/relation rồi xóa metadata cũ trong cùng transaction.
    // Chỉ trả previousFile sau commit để application dọn object vật lý cũ an toàn.
    async replaceDocumentFile(
        documentId: string,
        outputFile: NewUserDocumentFile,
        expectedCurrentFile?: ExpectedUserDocumentFile,
    ): Promise<ReplacedUserDocumentFile> {
        return this.dataSource.transaction(async (manager) => {
            // Bước 1.1: khóa row để cập nhật đồng thời phải đợi revision trước commit.
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId },
                lock: { mode: 'pessimistic_write' },
            });

            // Nếu provisioning đã mất, dừng để transaction không commit thay đổi dở dang.
            if (!document) {
                throw new Error(
                    'User document disappeared during file update.',
                );
            }

            // Chỉ thay file document READY có output reference; trạng thái khác không có revision hợp lệ.
            if (
                document.status !== UserDocumentStatus.READY ||
                !document.outputFileId
            ) {
                throw new Error('User document is not ready for file update.');
            }

            // Tải metadata riêng vì SELECT FOR UPDATE không khóa an toàn quan hệ nullable qua outer join.
            // FK thuộc row đang khóa nên reference vẫn theo cùng revision đang được kiểm tra.
            const currentOutputFile = await manager.findOne(StoredFile, {
                where: { id: document.outputFileId },
            });
            // FK thiếu metadata thì dừng; không xác định được file cũ để trả cho bước cleanup.
            if (!currentOutputFile) {
                throw new Error('User document output file disappeared.');
            }
            document.outputFile = currentOutputFile;

            // Bước 1.2: callback truyền file kỳ vọng; lệch namespace/key nghĩa là đã có revision mới.
            // Từ chối trước khi tạo metadata để callback cũ không ghi đè bản mới nhất.
            if (
                expectedCurrentFile &&
                (document.outputFile.storageNamespace !==
                    expectedCurrentFile.storageNamespace ||
                    document.outputFile.objectKey !==
                        expectedCurrentFile.objectKey)
            ) {
                throw new UserDocumentRevisionConflictError();
            }

            const previousFile = toStoredFileReference(document.outputFile);
            const previousFileId = document.outputFile.id;

            // Bước 2.1: ghi metadata mới; lỗi ở bước sau khiến insert này cùng rollback.
            const savedFile = await manager.save(
                manager.create(StoredFile, {
                    ...outputFile,
                    provider: this.toStorageProvider(outputFile.provider),
                }),
            );

            // Bước 2.2: đổi cả FK và relation vì entity vẫn giữ relation cũ đã nạp ở trên.
            document.outputFileId = savedFile.id;
            document.outputFile = savedFile;
            document.failureCode = null;
            const savedDocument = await manager.save(document);

            // Bước 2.3: xóa row metadata cũ sau khi document đã trỏ sang file mới.
            // Nếu xóa hoặc reload lỗi, transaction rollback FK mới và khôi phục metadata cũ.
            await manager.delete(StoredFile, previousFileId);

            // Nạp lại relation cho read model; nếu thiếu, ném lỗi để rollback transaction.
            const completeDocument = await manager.findOne(UserDocument, {
                where: { id: savedDocument.id },
                relations: {
                    outputFile: true,
                    sourceTemplateVersion: { template: true },
                },
            });

            // Nếu thiếu read model sau update, không trả kết quả thiếu relation cho caller.
            if (!completeDocument) {
                throw new Error('Updated user document could not be reloaded.');
            }

            // Transaction resolve sau commit; caller nhận reference cũ để xóa object vật lý.
            return {
                document: toUserDocumentRecord(completeDocument),
                previousFile,
            };
        });
    }

    // Lưu failure code ổn định thay vì ghi exception nội bộ vào response.
    async markDocumentFailed(
        documentId: string,
        failureCode: string,
    ): Promise<void> {
        await this.userDocuments.update(documentId, {
            status: UserDocumentStatus.FAILED,
            failureCode,
        });
    }

    // Chuyển provider ở contract sang enum persistence trước khi lưu metadata.
    private toStorageProvider(provider: 'local' | 's3'): FileStorageProvider {
        return provider === 'local'
            ? FileStorageProvider.LOCAL
            : FileStorageProvider.S3;
    }
}
