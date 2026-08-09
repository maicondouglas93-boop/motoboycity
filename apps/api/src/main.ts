import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getAllowedOrigins } from './common/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: getAllowedOrigins() });
  const port = process.env['API_PORT'] ?? process.env['PORT'] ?? 3333;
  await app.listen(port);
}

void bootstrap();
