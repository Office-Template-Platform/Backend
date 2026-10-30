// Use case lấy ảnh của một slide cụ thể trong phiên bản PPTX hiện hành.
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplatePreviewNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-preview-not-found.error';
import type { PresentationTemplatePreview } from '@/modules/presentation-template-library/application/types/presentation-template-preview';

@Injectable()
// Chỉ cho phép số thứ tự dương; repository không nhận index âm hoặc số không hợp lệ.
export class GetPresentationSlidePreviewService {
    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'findSlidePreview'
        >,
    ) {}

    // Validate vị trí trước I/O rồi trả 404 nếu mẫu hoặc ảnh slide không thuộc catalog public.
    async execute(
        templateId: string,
        slideNumber: number,
    ): Promise<PresentationTemplatePreview> {
        if (!Number.isInteger(slideNumber) || slideNumber < 1) {
            throw new BadRequestException(
                'Số thứ tự slide phải là số nguyên dương.',
            );
        }

        const file = await this.templateReader.findSlidePreview(
            templateId,
            slideNumber,
        );

        if (!file) {
            throw new PresentationTemplatePreviewNotFoundError();
        }

        return { file };
    }
}
