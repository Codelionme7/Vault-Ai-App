import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { MAX_CHUNK_BYTES } from '@echovault/shared';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

/**
 * Serverless entrypoint. Builds the NestJS app once per warm instance and hands
 * back the underlying Express handler so a platform function (e.g. Vercel) can
 * dispatch requests to it without binding a port.
 *
 * All routes live under the `/api` prefix to match the function's mount path,
 * and Swagger is intentionally omitted to keep cold starts lean.
 */
let cached: Express | null = null;

export async function createApp(): Promise<Express> {
  if (cached) return cached;

  validateEnv(process.env);

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bufferLogs: false,
  });

  app.setGlobalPrefix('api');
  // Raw body for chunk uploads (binary audio); JSON everywhere else. Unused when
  // storage is S3 (uploads go directly to the bucket), but kept for parity.
  app.use('/api/chunks/upload', express.raw({ type: () => true, limit: MAX_CHUNK_BYTES }));
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  await app.init();
  cached = server;
  return server;
}
