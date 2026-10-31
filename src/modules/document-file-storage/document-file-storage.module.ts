// Module cung cấp abstraction và adapter lưu file Office dùng chung cho các thư viện.
import { Module } from '@nestjs/common';
import { DOCUMENT_FILE_STORAGE } from '@/modules/document-file-storage/application/contracts/document-file-storage.contract';
import { LocalDocumentFileStorage } from '@/modules/document-file-storage/infrastructure/storage/local-document-file-storage';

@Module({
    providers: [
        LocalDocumentFileStorage,
        {
            provide: DOCUMENT_FILE_STORAGE,
            useExisting: LocalDocumentFileStorage,
        },
    ],
    exports: [DOCUMENT_FILE_STORAGE],
})
export class DocumentFileStorageModule {}
