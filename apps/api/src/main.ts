import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env['API_PORT'] ?? process.env['PORT'] ?? 3333;
  await app.listen(port);
}

void bootstrap();
