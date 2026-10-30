// Khai báo contract JSON giữa backend và ONLYOFFICE Docs cho mở editor, tải file và callback.
// Các type này chỉ hỗ trợ TypeScript; chữ ký JWT, quyền truy cập và giá trị payload phải được xác minh ở service.

export type OnlyOfficeDocumentEditorConfig = {
    // Chọn Word hoặc Slide Editor theo định dạng của file Office đang mở.
    documentType: 'word' | 'slide';
    // Dùng giao diện desktop tiêu chuẩn của Docs Server thay cho chế độ mobile/embedded.
    type: 'desktop';
    // Kích thước khung editor trong trang; đây không phải kích thước trang DOCX.
    width: '100%';
    height: '100%';
    // JWT backend ký trên toàn bộ config; browser chỉ nhận token đã ký, không nhận shared secret.
    token: string;
    document: {
        // Định dạng file native mà ONLYOFFICE mở và gửi lại sau khi lưu.
        fileType: 'docx' | 'pptx';
        // Khóa phiên bản tài liệu phía ONLYOFFICE; phải đổi khi object file đổi để tách các revision.
        key: string;
        // Tên hiển thị trong editor; không dùng giá trị này làm đường dẫn lưu file.
        title: string;
        // URL API có token để Document Server tải đúng bản sao Office người dùng được phép sửa.
        url: string;
        permissions: {
            // Cho phép sửa vì màn hình này mở editor ở chế độ chỉnh sửa.
            edit: true;
            // Cho phép tải file Office từ editor theo quyền hiện hành của sản phẩm.
            download: true;
            // Cho phép in tài liệu từ editor theo quyền hiện hành của sản phẩm.
            print: true;
        };
    };
    editorConfig: {
        // Cấu hình giao diện bổ sung; luôn gửi object rỗng vì Docs Server v10 đọc nhánh customization.font.
        customization: Record<string, unknown>;
        // Endpoint API mà Document Server gọi để báo trạng thái và gửi file Office đã lưu.
        callbackUrl: string;
        // Ngôn ngữ giao diện editor dành cho người dùng hiện tại.
        lang: 'vi';
        // Chế độ mở; contract hiện tại luôn cho phép người dùng chỉnh sửa.
        mode: 'edit';
        user: {
            // Định danh phiên người dùng trong ONLYOFFICE; hiện là ID ứng dụng, không phải tài khoản đăng nhập.
            id: string;
            // Tên hiển thị trong lịch sử cộng tác của ONLYOFFICE.
            name: string;
        };
    };
};

// Response frontend dùng để nạp script từ Docs Server và khởi tạo editor bằng config đã ký.
export type OnlyOfficeEditorConfigResponse = {
    // URL public mà browser truy cập để tải JavaScript API của ONLYOFFICE.
    apiScriptUrl: string;
    // Cấu hình hoàn chỉnh do backend tạo; không tự sửa payload sau khi JWT đã được ký.
    config: OnlyOfficeDocumentEditorConfig;
};

// Các trường callback backend cần để kiểm tra trạng thái và tải bản DOCX/PPTX cuối.
export type OnlyOfficeCallbackPayload = {
    // Khóa phiên bản mà ONLYOFFICE đang báo; backend đối chiếu với revision hiện tại trước khi ghi.
    key: string;
    // Trạng thái callback: 1 đang sửa, 2 sẵn sàng lưu cuối, 3 lưu lỗi, 4 đóng không đổi,
    // 6 đang force-save và 7 force-save lỗi; service chỉ commit nội dung ở trạng thái 2.
    status: number;
    // URL tạm do Docs Server cấp, có ở các trạng thái lưu; backend chỉ tải URL thuộc origin đã cấu hình.
    url?: string;
    // Đuôi file ở `url`; optional vì callback không có file ở mọi trạng thái.
    filetype?: string;
};

// Claims backend đọc từ JWT Authorization của callback; đây là dữ liệu ký bởi Docs Server, không phải body thô.
export type OnlyOfficeCallbackTokenClaims = {
    // Docs Server v10 gắn operation=callback; service yêu cầu đúng giá trị này khi xác minh token.
    operation?: string;
    // Payload được ký của callback; backend so các trường quan trọng với body nhận được để phát hiện sai khác.
    payload?: OnlyOfficeCallbackPayload;
};

// Claims trong token truy cập editor-file do backend ký và giới hạn cho đúng tài liệu, revision, mục đích.
export type OnlyOfficeFileAccessClaims = {
    // ID tài liệu mà URL tải file được cấp; phải khớp ID trên route.
    documentId?: string;
    // Khóa revision của editor; ngăn token cũ đọc file sau khi nội dung đã đổi.
    key?: string;
    // Phân biệt token tải DOCX khỏi JWT dùng cho editor config hoặc callback.
    purpose?: string;
};
