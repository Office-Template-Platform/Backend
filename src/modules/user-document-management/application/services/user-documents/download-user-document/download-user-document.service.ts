// Use case cấp file reference nội bộ để controller tải tài liệu đã READY.
import {
    Inject,
    Injectable,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import { getOfficeDocumentFormat } from '@/modules/document-file-storage/application/types/office-document-format/office-document-format';
import type { StoredFileReference } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/user-document-management/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/user-document-management/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/user-document-management/application/errors/user-document-not-ready.error';

export type UserDocumentDownload = {
    file: StoredFileReference;
    filename: string;
};

@Injectable()
// Chỉ chuyển file reference qua controller sau khi xác minh trạng thái và output file.
export class DownloadUserDocumentService {
    // Reader chịu trách nhiệm nạp bản ghi và metadata file hiện tại.
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findUserDocumentByIdForWorkspace'
        >,
    ) {}

    // Phân biệt tài liệu không tồn tại với tài liệu đang tạo/thất bại để client xử lý đúng.
    async execute(
        id: string,
        workspaceId: string,
    ): Promise<UserDocumentDownload> {
        const document =
            await this.documentReader.findUserDocumentByIdForWorkspace(
                id,
                workspaceId,
            );

        if (!document) {
            throw new UserDocumentNotFoundError();
        }

        if (document.status !== 'ready' || !document.outputFile) {
            throw new UserDocumentNotReadyError();
        }

        // MIME là nguồn sự thật cho phần mở rộng; không gắn sai .docx cho một bản PPTX.
        const format = getOfficeDocumentFormat(document.outputFile.mimeType);

        if (!format) {
            throw new UnsupportedMediaTypeException(
                'Định dạng tài liệu tải xuống chưa được hỗ trợ.',
            );
        }

        return {
            file: document.outputFile,
            filename: `${document.title}.${format.extension}`,
        };
    }
}
