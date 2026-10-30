// Đóng gói JWT và adapter ONLYOFFICE để các feature tài liệu dùng chung cấu hình server.
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OnlyOfficeDocsService } from '@/integrations/onlyoffice/services/onlyoffice-docs.service';

@Module({
    imports: [JwtModule.register({})],
    providers: [OnlyOfficeDocsService],
    exports: [OnlyOfficeDocsService],
})
export class OnlyOfficeDocsModule {}
