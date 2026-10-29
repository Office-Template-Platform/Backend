import { Module } from '@nestjs/common';
import { HealthController } from '@/modules/health/presentation/controllers/health.controller';

// Đóng gói endpoint health riêng để AppModule chỉ phụ thuộc vào module tính năng.
@Module({
    controllers: [HealthController],
})
export class HealthModule {}
