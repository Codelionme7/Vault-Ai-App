/**
 * Emit the OpenAPI spec to apps/backend/openapi.json without starting a server.
 * Run: npm run openapi --workspace @echovault/backend
 *
 * Requires Redis reachable (the BullMQ worker initializes during app bootstrap);
 * Postgres is NOT required (PrismaService swallows connection errors). We never
 * call app.listen(). The live spec is also served at GET /docs at runtime.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('EchoVault AI API')
    .setDescription('Audio-first meeting & knowledge capture. Audio is the source of truth.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote openapi.json (${Object.keys(document.paths).length} paths)`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
