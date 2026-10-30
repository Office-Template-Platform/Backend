// Use case trả chi tiết bộ PPTX công khai cùng các ảnh slide đã đăng ký.
import { Inject, Injectable } from '@nestjs/common';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplateNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-not-found.error';

@Injectable()
// Mẫu private, archived hoặc thiếu current version không được lộ qua endpoint detail.
export class GetPresentationTemplateService {
    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'findPublishedById'
        >,
    ) {}

    // Đọc detail qua port và ánh xạ mọi trường hợp không public thành cùng lỗi 404.
    async execute(id: string) {
        const template = await this.templateReader.findPublishedById(id);

        if (!template) {
            throw new PresentationTemplateNotFoundError();
        }

        return template;
    }
}
