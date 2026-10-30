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
    NewUserDocumentFile,
    ReplacedUserDocumentFile,
    UserDocumentWriterContract,
} from '@/modules/document-template-library/application/contracts/user-document-writer.contract';
import type { UserDocumentRecord } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import {
    toStoredFileReference,
    toUserDocumentRecord,
} from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';

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
    ): Promise<string> {
        const document = this.userDocuments.create({
            sourceTemplateVersionId,
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

    // Thay output atomically; file metadata cũ chỉ xóa trong transaction sau khi reference mới được gán.
    async replaceDocumentFile(
        documentId: string,
        outputFile: NewUserDocumentFile,
    ): Promise<ReplacedUserDocumentFile> {
        return this.dataSource.transaction(async (manager) => {
            const document = await manager.findOne(UserDocument, {
                where: { id: documentId },
                relations: { outputFile: true },
            });

            if (!document) {
                throw new Error(
                    'User document disappeared during file update.',
                );
            }
            if (
                document.status !== UserDocumentStatus.READY ||
                !document.outputFile
            ) {
                throw new Error('User document is not ready for file update.');
            }

            const previousFile = toStoredFileReference(document.outputFile);
            const previousFileId = document.outputFile.id;
            const savedFile = await manager.save(
                manager.create(StoredFile, {
                    ...outputFile,
                    provider: this.toStorageProvider(outputFile.provider),
                }),
            );
            document.outputFileId = savedFile.id;
            document.failureCode = null;
            const savedDocument = await manager.save(document);
            // File cũ hết liên kết; xóa record cùng transaction để không giữ metadata mồ côi.
            await manager.delete(StoredFile, previousFileId);
            const completeDocument = await manager.findOne(UserDocument, {
                where: { id: savedDocument.id },
                relations: {
                    outputFile: true,
                    sourceTemplateVersion: { template: true },
                },
            });

            if (!completeDocument) {
                throw new Error('Updated user document could not be reloaded.');
            }

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
