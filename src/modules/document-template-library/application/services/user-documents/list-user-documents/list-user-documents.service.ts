// Liệt kê metadata tài liệu trong đúng workspace và sắp bản vừa chỉnh gần nhất lên đầu.
import { Inject, Injectable } from '@nestjs/common';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
    type UserDocumentListQuery,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { toUserDocumentSummary } from '@/modules/document-template-library/application/utils/to-user-document-summary';

@Injectable()
// Service chỉ điều phối lọc/phân trang qua read contract và không biết TypeORM.
export class ListUserDocumentsService {
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'listUserDocumentsByWorkspace'
        >,
    ) {}

    // Chuyển kết quả reader thành summary công khai và tính metadata trang nhất quán.
    async execute(workspaceId: string, query: UserDocumentListQuery) {
        const { items, total } =
            await this.documentReader.listUserDocumentsByWorkspace(
                workspaceId,
                query,
            );

        return {
            items: items.map(toUserDocumentSummary),
            total,
            page: query.page,
            limit: query.limit,
            totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        };
    }
}
