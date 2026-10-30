// Nhóm unit test cho CreateUserDocumentController: xác nhận controller chuyển template ID và title sang use case tạo tài liệu.
// | STT | Test case   | Mục đích                      | Các bước làm                              | Kết quả mong đợi                                |
// |-----|-------------|-------------------------------|-------------------------------------------|-------------------------------------------------|
// | 1   | Tạo bản sao | Ủy quyền tạo từ mẫu được chọn | Gọi create với template UUID và DTO title | Trả summary từ service và chuyển đúng arguments |

import type { UserDocumentSummary } from '@/modules/document-template-library/application/contracts/user-document-reader.contract';
import { CreateUserDocumentService } from '@/modules/document-template-library/application/services/user-documents/create-user-document/create-user-document.service';
import { CreateUserDocumentController } from '@/modules/document-template-library/presentation/controllers/document-templates/create-user-document/create-user-document.controller';
import { CreateUserDocumentDto } from '@/modules/document-template-library/presentation/dto/create-user-document/create-user-document.dto';

describe('CreateUserDocumentController', () => {
    let target: CreateUserDocumentController;
    let mockCreateUserDocument: jest.Mocked<
        Pick<CreateUserDocumentService, 'execute'>
    >;

    beforeEach(() => {
        mockCreateUserDocument = { execute: jest.fn() };
        target = new CreateUserDocumentController(
            mockCreateUserDocument as unknown as CreateUserDocumentService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test 1 title tùy chọn đi cùng template UUID, còn summary chỉ do use case tạo.
    it('should create a document from the selected template', async () => {
        // Bước 1 - Arrange: chuẩn bị request body và summary sau khi tạo.
        const body = Object.assign(new CreateUserDocumentDto(), {
            title: 'My Resume',
        });
        const expected = {
            id: 'document-1',
            title: 'My Resume',
            status: 'ready',
            failureCode: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            downloadUrl: '/api/user-documents/document-1/download',
            sourceTemplate: { id: 'template-1', name: 'Resume', version: 1 },
        } satisfies UserDocumentSummary;
        mockCreateUserDocument.execute.mockResolvedValue(expected);

        // Bước 2 - Act: gọi endpoint POST /document-templates/:templateId/documents.
        const result = await target.create('template-1', 'workspace-1', body);

        // Bước 3 - Assert: trả summary và chuyển đúng template ID cùng title.
        expect(result).toEqual(expected);
        expect(mockCreateUserDocument.execute.mock.calls).toEqual([
            ['template-1', 'workspace-1', 'My Resume'],
        ]);
    });
});
