// Hợp đồng tối thiểu của file multipart sau khi Multer giữ nội dung trong memory.
export type UploadedDocxFile = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};
