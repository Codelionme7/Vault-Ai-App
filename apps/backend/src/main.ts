import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import { MAX_CHUNK_BYTES } from '@echovault/shared';

async function bootstrap(): Promise<void> {
  validateEnv(process.env);
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Raw body for chunk uploads (binary audio); JSON everywhere else.
  app.use('/chunks/upload', express.raw({ type: () => true, limit: MAX_CHUNK_BYTES }));

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('EchoVault AI API')
    .setDescription(
      'Audio-first meeting & knowledge capture. Audio is the source of truth; ' +
        'transcription is optional and asynchronous.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('recordings')
    .addTag('chunks')
    .addTag('search')
    .addTag('transcription')
    .addTag('health')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Emit the OpenAPI spec to disk so it can be committed / consumed by clients.
  if (process.env.EMIT_OPENAPI === 'true') {
    writeFileSync('openapi.json', JSON.stringify(document, null, 2));
    logger.log('Wrote openapi.json');
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`EchoVault API listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
