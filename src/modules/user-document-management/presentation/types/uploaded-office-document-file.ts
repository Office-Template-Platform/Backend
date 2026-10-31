// Hợp đồng tối thiểu của file DOCX/PPTX multipart sau khi Multer giữ nội dung trong memory.
export type UploadedOfficeDocumentFile = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};
