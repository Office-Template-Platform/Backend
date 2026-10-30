// Cấp cấu hình editor Office cho revision DOCX hoặc PPTX mà người dùng được phép sửa.
import { createHash } from 'node:crypto';
import {
    Inject,
    Injectable,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
    USER_DOCUMENT_READER,
    type UserDocumentReaderContract,
} from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { UserDocumentNotFoundError } from '@/modules/document-template-library/application/errors/user-document-not-found.error';
import { UserDocumentNotReadyError } from '@/modules/document-template-library/application/errors/user-document-not-ready.error';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';
import { getOfficeDocumentFormat } from '@/modules/document-template-library/application/types/office-document-format/office-document-format';

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

        // Chỉ DOCX/PPTX native đã biết được đưa vào editor; định dạng khác không được đoán.
        const fileFormat = getOfficeDocumentFormat(
            document.outputFile.mimeType,
        );
        if (!fileFormat) {
            throw new UnsupportedMediaTypeException(
                'Trình soạn thảo tích hợp chỉ hỗ trợ file DOCX và PPTX.',
            );
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
            fileFormat.extension,
        );
    }
}
