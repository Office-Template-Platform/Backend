// Use case liệt kê bộ mẫu PPTX đã công bố và chuyển filter sang reader contract.
import { Inject, Injectable } from '@nestjs/common';
import {
    PRESENTATION_TEMPLATE_READER,
    type PresentationTemplateFilters,
    type PresentationTemplateReaderContract,
} from '@/modules/presentation-template-library/application/contracts/presentation-template-reader.contract';

@Injectable()
// Service chỉ điều phối input catalog; query, sort và mapping nằm trong TypeORM adapter.
export class ListPresentationTemplatesService {
    constructor(
        @Inject(PRESENTATION_TEMPLATE_READER)
        private readonly templateReader: Pick<
            PresentationTemplateReaderContract,
            'list'
        >,
    ) {}

    // Trả mảng theo hợp đồng hiện frontend đang dùng; filter rỗng tương đương toàn bộ mẫu public.
    execute(filters: PresentationTemplateFilters) {
        return this.templateReader.list(filters);
    }
}
