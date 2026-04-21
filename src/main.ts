import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN?.split(',') ?? true),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0'); // Force IPv4 binding
}
bootstrap();
