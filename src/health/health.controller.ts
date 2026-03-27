import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  health() {
    const dbStatus =
      this.connection.readyState === ConnectionStates.connected
        ? 'connected'
        : 'disconnected';
    return {
      status: 'ok',
      database: dbStatus,
    };
  }
}
