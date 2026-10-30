// Xác thực URL nội bộ trước khi Document Server đọc file DOCX của người dùng.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import type { StoredFileReference } from '@/modules/document-template-library/application/contracts/document-file-storage.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';

export type UserDocumentEditorFile = {
    file: StoredFileReference;
    filename: string;
};

@Injectable()
// Chỉ trả file reference nội bộ sau khi token khớp document id và revision hiện hành.
export class GetUserDocumentEditorFileService {
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findUserDocumentById'
        >,
        private readonly onlyOfficeDocs: OnlyOfficeDocsService,
    ) {}

    // Trả file của revision đang mở; URL token hết hạn và revision đổi sau mỗi lần lưu.
    async execute(
        documentId: string,
        token: string | undefined,
    ): Promise<UserDocumentEditorFile> {
        const document =
            await this.documentReader.findUserDocumentById(documentId);

        // Nếu không tìm thấy document hoặc chưa có bản output, trả lỗi để callback được ACK an toàn.
        if (!document) {
            throw new UserDocumentNotFoundError();
        }
        // Nếu document chưa sẵn sàng hoặc chưa có file output, trả lỗi để callback được ACK an toàn.
        if (document.status !== 'ready' || !document.outputFile) {
            throw new UserDocumentNotReadyError();
        }

        // Xác minh token khớp document id và revision hiện hành để tránh URL bị lộ ra ngoài.
        const key = createEditorKey(document.id, document.outputFile);
        await this.onlyOfficeDocs.verifyDocumentFileToken(
            token,
            documentId,
            key,
        );

        return {
            file: document.outputFile,
            filename: `${document.title}.docx`,
        };
    }
}

// Dùng cùng công thức với editor config để URL chỉ mở được đúng object version hiện tại.
function createEditorKey(
    documentId: string,
    file: StoredFileReference,
): string {
    // Dùng SHA256 để tránh lộ thông tin nhạy cảm trong URL; chỉ cần đủ dài để tránh trùng lặp.
    return createHash('sha256')
        .update(`${documentId}:${file.storageNamespace}:${file.objectKey}`)
        .digest('hex');
}
