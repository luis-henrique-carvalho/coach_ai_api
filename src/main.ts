import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS with credentials support
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:5173'),
    credentials: true,
  });

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Get port from config
  const port = configService.get<number>('PORT', 3000);

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
