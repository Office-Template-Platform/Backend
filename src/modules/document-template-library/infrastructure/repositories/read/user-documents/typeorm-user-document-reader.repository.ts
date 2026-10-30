// TypeORM read adapter cho tài liệu người dùng và các quan hệ snapshot cần cho metadata.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from '@/database/entities/user-document.entity';
import type {
    UserDocumentReaderContract,
    UserDocumentRecord,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { toUserDocumentRecord } from '@/modules/document-template-library/infrastructure/repositories/mappers/document-template-record.mapper';

@Injectable()
// Adapter chỉ đọc user document; query và entity mapping không lọt vào application service.
export class TypeOrmUserDocumentReaderRepository implements UserDocumentReaderContract {
    // Repository nạp output file và template-version snapshot trong một lần đọc.
    constructor(
        @InjectRepository(UserDocument)
        private readonly userDocuments: Repository<UserDocument>,
    ) {}

    // Trả null khi id không tồn tại để application quyết định lỗi domain/HTTP.
    async findUserDocumentById(id: string): Promise<UserDocumentRecord | null> {
        const document = await this.userDocuments.findOne({
            where: { id },
            relations: {
                outputFile: true,
                sourceTemplateVersion: { template: true },
            },
        });

        return document ? toUserDocumentRecord(document) : null;
    }
}
