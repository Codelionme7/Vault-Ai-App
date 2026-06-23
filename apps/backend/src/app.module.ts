import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { type AppConfig } from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { ChunksModule } from './chunks/chunks.module';
import { ExportModule } from './export/export.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { RecordingsModule } from './recordings/recordings.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { TranscriptionModule } from './transcription/transcription.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // BullMQ root connection; queues are registered per-feature module.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            // Don't let a missing Redis crash the API; jobs simply won't run.
            maxRetriesPerRequest: null,
            enableOfflineQueue: true,
          },
        };
      },
    }),
    PrismaModule,
    CryptoModule,
    StorageModule,
    AuthModule,
    RecordingsModule,
    ChunksModule,
    SearchModule,
    TranscriptionModule,
    ExportModule,
    HealthModule,
  ],
})
export class AppModule {}
