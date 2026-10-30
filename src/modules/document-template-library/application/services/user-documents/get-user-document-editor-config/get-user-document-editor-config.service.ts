// Cấp cấu hình editor cho một revision DOCX mà người dùng được phép sửa.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';

@Injectable()
// Chỉ cấp editor config khi bản sao READY có file đầu ra; key bám theo object version để tránh cache cũ.
export class GetUserDocumentEditorConfigService {
    constructor(
        @Inject(USER_DOCUMENT_READER)
        private readonly documentReader: Pick<
            UserDocumentReaderContract,
            'findUserDocumentByIdForWorkspace'
        >,
        private readonly onlyOfficeDocs: OnlyOfficeDocsService,
    ) {}

    // Tạo key ổn định trong cùng revision nhưng đổi ngay khi storage chuyển sang object file mới.
    async execute(documentId: string, workspaceId: string) {
        const document =
            await this.documentReader.findUserDocumentByIdForWorkspace(
                documentId,
                workspaceId,
            );

        if (!document) {
            throw new UserDocumentNotFoundError();
        }

        if (document.status !== 'ready' || !document.outputFile) {
            throw new UserDocumentNotReadyError();
        }

        const key = createHash('sha256')
            .update(
                `${document.id}:${document.outputFile.storageNamespace}:${document.outputFile.objectKey}`,
            )
            .digest('hex');

        return this.onlyOfficeDocs.createEditorConfig(
            document.id,
            document.title,
            key,
        );
    }
}
