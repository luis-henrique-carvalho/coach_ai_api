import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  health() {
    const dbStatus = this.connection.readyState === 1 ? 'connected' : 'disconnected';
    return {
      status: 'ok',
      database: dbStatus,
    };
  }
}
