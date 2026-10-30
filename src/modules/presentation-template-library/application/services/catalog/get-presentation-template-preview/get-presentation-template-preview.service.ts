// Use case lấy file thumbnail của version PPTX hiện hành để controller stream binary.
import { Inject, Injectable } from '@nestjs/common';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';
import { PresentationTemplatePreviewNotFoundError } from '@/modules/presentation-template-library/application/errors/presentation-template-preview-not-found.error';
import type { PresentationTemplatePreview } from '@/modules/presentation-template-library/application/types/presentation-template-preview';

@Injectable()
// Use case chỉ trả file reference đã được reader xác nhận thuộc mẫu public.
export class GetPresentationTemplatePreviewService {
    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'findCurrentPreview'
        >,
    ) {}

    // Không cho controller tự đoán đường dẫn khi mẫu thiếu thumbnail hoặc không còn public.
    async execute(id: string): Promise<PresentationTemplatePreview> {
        const file = await this.templateReader.findCurrentPreview(id);

        if (!file) {
            throw new PresentationTemplatePreviewNotFoundError();
        }

        return { file };
    }
}
