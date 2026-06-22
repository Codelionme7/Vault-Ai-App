import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { summarizeText } from './summarize';
import { TranscriptionService } from './transcription.service';
import { TRANSCRIPTION_QUEUE, type TranscriptionJob } from './transcription.types';

/** Preferred channel to transcribe, best first. */
const CHANNEL_PREFERENCE = ['mixed', 'tab', 'mic'];

/**
 * Background worker. Runs entirely off the recording hot path: it assembles a
 * recording's stored (encrypted) chunks, decrypts them, runs the configured
 * transcription driver, and persists the transcript (+ optional summary).
 * Failures mark the transcript `failed` but never touch the audio.
 */
@Processor(TRANSCRIPTION_QUEUE)
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly transcription: TranscriptionService,
  ) {
    super();
  }

  async process(job: Job<TranscriptionJob>): Promise<void> {
    const { recordingId, language, diarize, summarize } = job.data;
    const driver = this.transcription.createDriver();
    if (!driver) {
      await this.fail(recordingId, 'transcription driver not configured');
      return;
    }

    try {
      await this.setStatus(recordingId, 'processing');

      const assembled = await this.assembleAudio(recordingId);
      if (!assembled) {
        await this.fail(recordingId, 'no audio chunks to transcribe');
        return;
      }

      const result = await driver.transcribe(assembled.bytes, {
        mimeType: assembled.mimeType,
        language,
        diarize,
      });

      await this.prisma.transcript.update({
        where: { recordingId },
        data: {
          status: 'completed',
          language: result.language,
          model: result.model,
          text: result.text,
          segments: result.segments as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await this.prisma.recording.update({
        where: { id: recordingId },
        data: { transcriptStatus: 'completed' },
      });

      if (summarize) {
        const s = summarizeText(result.text);
        await this.prisma.summary.upsert({
          where: { recordingId },
          create: { recordingId, ...s },
          update: { ...s },
        });
      }

      this.logger.log(`Transcribed recording ${recordingId} (${result.text.length} chars)`);
    } catch (err) {
      await this.fail(recordingId, (err as Error).message);
      throw err; // let BullMQ retry per the job's backoff policy
    }
  }

  /** Decrypt + concatenate the best available channel's chunks in order. */
  private async assembleAudio(
    recordingId: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const chunks = await this.prisma.chunk.findMany({
      where: { recordingId },
      orderBy: [{ channel: 'asc' }, { sequence: 'asc' }],
    });
    if (chunks.length === 0) return null;

    const channels = [...new Set(chunks.map((c) => c.channel))];
    const channel =
      CHANNEL_PREFERENCE.find((c) => channels.includes(c)) ?? channels[0];
    const selected = chunks
      .filter((c) => c.channel === channel)
      .sort((a, b) => a.sequence - b.sequence);

    const parts: Buffer[] = [];
    for (const c of selected) {
      parts.push(await this.storage.getDecrypted(c.storageKey));
    }
    return { bytes: Buffer.concat(parts), mimeType: selected[0]?.mimeType ?? 'audio/webm' };
  }

  private async setStatus(
    recordingId: string,
    status: 'processing' | 'completed' | 'failed',
  ): Promise<void> {
    await this.prisma.transcript.update({ where: { recordingId }, data: { status } });
    await this.prisma.recording.update({
      where: { id: recordingId },
      data: { transcriptStatus: status },
    });
  }

  private async fail(recordingId: string, reason: string): Promise<void> {
    this.logger.warn(`Transcription failed for ${recordingId}: ${reason}`);
    await this.setStatus(recordingId, 'failed').catch(() => undefined);
  }
}
