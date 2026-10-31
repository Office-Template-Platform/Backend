// Liệt kê metadata tài liệu trong đúng workspace và sắp bản vừa chỉnh gần nhất lên đầu.
import { Inject, Injectable } from '@nestjs/common';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
    type UserDocumentListQuery,
    type UserDocumentRecord,
} from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { toUserDocumentSummary } from '@/modules/user-document-management/application/utils/to-user-document-summary';
import { getOfficeDocumentFormat } from '@/modules/document-file-storage/application/types/office-document-format/office-document-format';

@Injectable()
// Service chỉ điều phối lọc/phân trang qua read contract và không biết TypeORM.
export class ListUserDocumentsService {
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            | 'listUserDocumentsByWorkspace'
            | 'listDeletedUserDocumentsByWorkspace'
        >,
    ) {}

    // Chuyển danh sách đang hoạt động thành summary công khai và tính metadata trang nhất quán.
    async execute(workspaceId: string, query: UserDocumentListQuery) {
        const { items, total } =
            await this.documentReader.listUserDocumentsByWorkspace(
                workspaceId,
                query,
            );

        return this.toPageResult(items, total, query, true);
    }

    // Liệt kê thùng rác cùng contract phân trang; file chỉ có thể mở/tải sau khi tài liệu được khôi phục.
    async executeDeleted(workspaceId: string, query: UserDocumentListQuery) {
        const { items, total } =
            await this.documentReader.listDeletedUserDocumentsByWorkspace(
                workspaceId,
                query,
            );

        return this.toPageResult(items, total, query, false);
    }

    // Giữ hai danh sách cùng cấu trúc response và tránh phát URL tải không hoạt động trong thùng rác.
    private toPageResult(
        items: UserDocumentRecord[],
        total: number,
        query: UserDocumentListQuery,
        includeDownloadUrl: boolean,
    ) {
        return {
            // Gửi định dạng file để giao diện phân biệt DOCX và PPTX trong thư viện chung.
            items: items.map((document) => {
                const summary = toUserDocumentSummary(document);

                return {
                    ...summary,
                    downloadUrl: includeDownloadUrl
                        ? summary.downloadUrl
                        : null,
                    fileType: document.outputFile
                        ? (getOfficeDocumentFormat(document.outputFile.mimeType)
                              ?.extension ?? null)
                        : null,
                };
            }),
            total,
            page: query.page,
            limit: query.limit,
            totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        };
    }
}
