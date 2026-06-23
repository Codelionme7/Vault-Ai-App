import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionProcessor } from './transcription.processor';
import { TranscriptionService } from './transcription.service';
import { TRANSCRIPTION_QUEUE } from './transcription.types';

@Module({
  imports: [BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE })],
  controllers: [TranscriptionController],
  providers: [TranscriptionService, TranscriptionProcessor],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
