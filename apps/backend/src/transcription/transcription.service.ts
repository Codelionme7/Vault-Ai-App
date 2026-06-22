import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpenAiTranscriptionDriver } from './drivers/openai.driver';
import { LocalWhisperDriver } from './drivers/whisper.driver';
import {
  TRANSCRIPTION_QUEUE,
  type TranscriptionDriver,
  type TranscriptionJob,
} from './transcription.types';

@Injectable()
export class TranscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue(TRANSCRIPTION_QUEUE) private readonly queue: Queue<TranscriptionJob>,
  ) {}

  /** Resolve the configured transcription backend, or null when disabled. */
  createDriver(): TranscriptionDriver | null {
    const cfg = this.config.get('transcription', { infer: true });
    if (cfg.driver === 'openai' && cfg.openaiApiKey) {
      return new OpenAiTranscriptionDriver(cfg.openaiApiKey);
    }
    if (cfg.driver === 'local-whisper' && cfg.whisperServiceUrl) {
      return new LocalWhisperDriver(cfg.whisperServiceUrl);
    }
    return null;
  }

  /** Queue a transcription job. Never blocks recording — fully asynchronous. */
  async request(
    ownerId: string,
    recordingId: string,
    opts: { language?: string; diarize?: boolean; summarize?: boolean },
  ): Promise<{ status: string }> {
    const rec = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!rec) throw new NotFoundException('Recording not found');
    if (rec.ownerId !== ownerId) throw new ForbiddenException('Not your recording');

    if (!this.createDriver()) {
      throw new BadRequestException(
        'Transcription is disabled. Set TRANSCRIPTION_DRIVER (openai|local-whisper) and credentials.',
      );
    }

    await this.prisma.transcript.upsert({
      where: { recordingId },
      create: { recordingId, status: 'queued', language: opts.language },
      update: { status: 'queued', language: opts.language },
    });
    await this.prisma.recording.update({
      where: { id: recordingId },
      data: { transcriptStatus: 'queued' },
    });

    await this.queue.add(
      'transcribe',
      {
        recordingId,
        language: opts.language,
        diarize: opts.diarize,
        summarize: opts.summarize,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );

    return { status: 'queued' };
  }

  async getTranscript(ownerId: string, recordingId: string) {
    await this.assertOwns(ownerId, recordingId);
    const transcript = await this.prisma.transcript.findUnique({ where: { recordingId } });
    if (!transcript) throw new NotFoundException('No transcript for this recording');
    return transcript;
  }

  async getSummary(ownerId: string, recordingId: string) {
    await this.assertOwns(ownerId, recordingId);
    const summary = await this.prisma.summary.findUnique({ where: { recordingId } });
    if (!summary) throw new NotFoundException('No summary for this recording');
    return summary;
  }

  private async assertOwns(ownerId: string, recordingId: string): Promise<void> {
    const rec = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      select: { ownerId: true },
    });
    if (!rec) throw new NotFoundException('Recording not found');
    if (rec.ownerId !== ownerId) throw new ForbiddenException('Not your recording');
  }
}
