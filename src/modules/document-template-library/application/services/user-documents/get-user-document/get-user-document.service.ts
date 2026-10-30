// Use case đọc metadata công khai của tài liệu, không đưa output storage reference ra ngoài.
import { Inject, Injectable } from '@nestjs/common';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
    type UserDocumentSummary,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { toUserDocumentSummary } from '@/modules/document-template-library/application/utils/to-user-document-summary';

@Injectable()
// Ẩn persistence details bằng projection dùng chung cho tạo mới, đọc và lưu nội dung.
export class GetUserDocumentService {
    // Adapter nạp liên kết file ở server nhưng response chỉ nhận summary.
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: UserDocumentReaderContract,
    ) {}

    // 404 cho ID không tồn tại; không phân biệt soft-delete hay trạng thái nội bộ.
    async execute(id: string): Promise<UserDocumentSummary> {
        const document = await this.documentReader.findUserDocumentById(id);

        if (!document) {
            throw new UserDocumentNotFoundError();
        }

        return toUserDocumentSummary(document);
    }
}
