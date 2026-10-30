// Nhóm unit test cho office-document-format: bảo đảm MIME Office được map đúng phần mở rộng và format lạ bị từ chối.
// | STT | Test case      | Mục đích                    | Các bước làm                        | Kết quả mong đợi                 |
// |-----|----------------|-----------------------------|-------------------------------------|----------------------------------|
// | 1   | MIME DOCX      | Giữ tương thích tải Word     | Tra MIME DOCX                       | Trả extension docx               |
// | 2   | MIME PPTX      | Tải đúng định dạng PowerPoint | Tra MIME PPTX                       | Trả extension pptx               |
// | 3   | MIME không rõ  | Không đoán đuôi file         | Tra application/pdf                | Trả null                         |

import {
    getOfficeDocumentFormat,
    OFFICE_DOCUMENT_FORMATS,
} from '@/modules/document-template-library/application/types/office-document-format/office-document-format';

describe('office-document-format', () => {
    // Test 1 giữ tên file DOCX cho các luồng Word đã hoạt động.
    it('should resolve the DOCX MIME type', () => {
        // Bước 1 - Arrange: dùng MIME chuẩn đã lưu trong StoredFile.
        const mimeType = OFFICE_DOCUMENT_FORMATS.docx.mimeType;

        // Bước 2 - Act: phân giải format từ MIME.
        const result = getOfficeDocumentFormat(mimeType);

        // Bước 3 - Assert: phần mở rộng và MIME giữ nguyên.
        expect(result).toEqual(OFFICE_DOCUMENT_FORMATS.docx);
    });

    // Test 2 xác nhận PPTX được nhận diện riêng, không rơi về extension DOCX.
    it('should resolve the PPTX MIME type', () => {
        // Bước 1 - Arrange: dùng MIME Open XML Presentation.
        const mimeType = OFFICE_DOCUMENT_FORMATS.pptx.mimeType;

        // Bước 2 - Act: tìm định dạng trong danh sách hỗ trợ.
        const result = getOfficeDocumentFormat(mimeType);

        // Bước 3 - Assert: format trả về có đuôi pptx.
        expect(result).toEqual(OFFICE_DOCUMENT_FORMATS.pptx);
        expect(result?.extension).toBe('pptx');
    });

    // Test 3 fail closed với MIME không nằm trong danh mục file Office được phép tải.
    it('should return null for an unsupported MIME type', () => {
        // Bước 1 - Arrange: cung cấp MIME PDF không thuộc DOCX/PPTX.
        const mimeType = 'application/pdf';

        // Bước 2 - Act: tra định dạng mà không suy đoán theo tên file.
        const result = getOfficeDocumentFormat(mimeType);

        // Bước 3 - Assert: không có extension được cấp.
        expect(result).toBeNull();
    });
});
