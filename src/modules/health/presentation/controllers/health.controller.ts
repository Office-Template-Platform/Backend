// Endpoint liveness không phụ thuộc database hay dịch vụ ngoài.
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// Controller xác nhận process còn nhận request; không đại diện trạng thái dịch vụ ngoài.
@ApiTags('Health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({ summary: 'Kiểm tra ứng dụng đang hoạt động' })
    @ApiOkResponse({ description: 'Tiến trình API đang hoạt động.' })
    // Trả trạng thái tiến trình để frontend hoặc monitor xác nhận API còn hoạt động.
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
        };
    }
}
