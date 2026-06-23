import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_ENABLED } from '../config/runtime';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionProcessor } from './transcription.processor';
import { TranscriptionService } from './transcription.service';
import { TRANSCRIPTION_QUEUE } from './transcription.types';

// When the background queue is disabled (serverless), the transcript/summary
// read endpoints still work; only the queue registration and worker are dropped.
@Module({
  imports: QUEUE_ENABLED ? [BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE })] : [],
  controllers: [TranscriptionController],
  providers: QUEUE_ENABLED
    ? [TranscriptionService, TranscriptionProcessor]
    : [TranscriptionService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
