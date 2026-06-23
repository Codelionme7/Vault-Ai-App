import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import type { TranscriptSegment } from '@echovault/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  type AudioExportFormat,
  contentTypeFor,
  extensionFor,
  ffmpegOutputArgs,
  pickPreferredChannel,
  requiresFfmpeg,
} from './audio-export';
import { buildMarkdownNotes } from './markdown';
import { renderSummaryPdf } from './pdf';
import { toPlainText, toSrt, toVtt } from './transcript-format';

export interface ExportFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export type TranscriptFormat = 'txt' | 'vtt' | 'srt' | 'md';
export type SummaryFormat = 'md' | 'pdf';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // --- Audio ---

  async exportAudio(
    ownerId: string,
    recordingId: string,
    format: AudioExportFormat,
    requestedChannel?: string,
  ): Promise<ExportFile> {
    const recording = await this.getOwned(ownerId, recordingId);
    const channels = await this.listChannels(recordingId);
    const channel = pickPreferredChannel(channels, requestedChannel);
    if (!channel) throw new NotFoundException('No audio chunks to export');

    const webm = await this.assembleChannel(recordingId, channel);

    let bytes = webm;
    if (requiresFfmpeg(format)) {
      bytes = await this.transcode(webm, format);
    }

    const safeTitle = slug(recording.title);
    return {
      filename: `${safeTitle}-${channel}.${extensionFor(format)}`,
      contentType: contentTypeFor(format),
      bytes,
    };
  }

  // --- Transcript ---

  async exportTranscript(
    ownerId: string,
    recordingId: string,
    format: TranscriptFormat,
  ): Promise<ExportFile> {
    const recording = await this.getOwned(ownerId, recordingId);
    const transcript = await this.prisma.transcript.findUnique({ where: { recordingId } });
    if (!transcript || transcript.status !== 'completed') {
      throw new BadRequestException('No completed transcript to export');
    }
    const segments = (transcript.segments as unknown as TranscriptSegment[]) ?? [];
    const safeTitle = slug(recording.title);

    const map: Record<TranscriptFormat, { body: string; type: string }> = {
      txt: { body: toPlainText(segments), type: 'text/plain' },
      vtt: { body: toVtt(segments), type: 'text/vtt' },
      srt: { body: toSrt(segments), type: 'application/x-subrip' },
      md: {
        body: buildMarkdownNotes({ recording: this.toMdRecording(recording), segments }),
        type: 'text/markdown',
      },
    };
    const { body, type } = map[format];
    return {
      filename: `${safeTitle}-transcript.${format}`,
      contentType: type,
      bytes: Buffer.from(body, 'utf8'),
    };
  }

  // --- Summary / notes ---

  async exportSummary(
    ownerId: string,
    recordingId: string,
    format: SummaryFormat,
  ): Promise<ExportFile> {
    const recording = await this.getOwned(ownerId, recordingId);
    const summary = await this.prisma.summary.findUnique({ where: { recordingId } });
    const transcript = await this.prisma.transcript.findUnique({ where: { recordingId } });
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? undefined;

    const md = buildMarkdownNotes({
      recording: this.toMdRecording(recording),
      summary: summary ?? undefined,
      segments,
    });
    const safeTitle = slug(recording.title);

    if (format === 'pdf') {
      return {
        filename: `${safeTitle}-summary.pdf`,
        contentType: 'application/pdf',
        bytes: renderSummaryPdf(recording.title, md.split('\n')),
      };
    }
    return {
      filename: `${safeTitle}-notes.md`,
      contentType: 'text/markdown',
      bytes: Buffer.from(md, 'utf8'),
    };
  }

  // --- ZIP bundle (everything) ---

  async exportZip(ownerId: string, recordingId: string): Promise<ExportFile> {
    const recording = await this.getOwned(ownerId, recordingId);
    const zip = new JSZip();
    const safeTitle = slug(recording.title);

    // Audio: original lossless WebM per channel.
    const channels = await this.listChannels(recordingId);
    for (const channel of channels) {
      const bytes = await this.assembleChannel(recordingId, channel);
      zip.file(`audio/${channel}.webm`, bytes);
    }

    // Transcript (if completed).
    const transcript = await this.prisma.transcript.findUnique({ where: { recordingId } });
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? [];
    if (transcript?.status === 'completed' && segments.length > 0) {
      zip.file('transcript.txt', toPlainText(segments));
      zip.file('transcript.vtt', toVtt(segments));
      zip.file('transcript.srt', toSrt(segments));
    }

    // Summary / notes.
    const summary = await this.prisma.summary.findUnique({ where: { recordingId } });
    const md = buildMarkdownNotes({
      recording: this.toMdRecording(recording),
      summary: summary ?? undefined,
      segments: segments.length ? segments : undefined,
    });
    zip.file('notes.md', md);
    if (summary) zip.file('summary.pdf', renderSummaryPdf(recording.title, md.split('\n')));

    // Machine-readable metadata.
    zip.file(
      'metadata.json',
      JSON.stringify(
        {
          id: recording.id,
          title: recording.title,
          sourceType: recording.sourceType,
          startedAt: recording.startedAt,
          endedAt: recording.endedAt,
          durationMs: recording.durationMs,
          sizeBytes: Number(recording.sizeBytes),
          channels,
          tags: recording.tags,
          metadata: recording.metadata,
        },
        null,
        2,
      ),
    );

    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return {
      filename: `${safeTitle}-export.zip`,
      contentType: 'application/zip',
      bytes,
    };
  }

  // --- internals ---

  /** Concatenate a channel's decrypted chunks into one WebM buffer. */
  private async assembleChannel(recordingId: string, channel: string): Promise<Buffer> {
    const chunks = await this.prisma.chunk.findMany({
      where: { recordingId, channel },
      orderBy: { sequence: 'asc' },
    });
    if (chunks.length === 0) throw new NotFoundException(`No chunks for channel ${channel}`);
    const parts: Buffer[] = [];
    for (const c of chunks) parts.push(await this.storage.getDecrypted(c.storageKey));
    return Buffer.concat(parts);
  }

  private async listChannels(recordingId: string): Promise<string[]> {
    const rows = await this.prisma.chunk.findMany({
      where: { recordingId },
      distinct: ['channel'],
      select: { channel: true },
    });
    return rows.map((r) => r.channel);
  }

  /**
   * Transcode WebM/Opus -> wav/mp3/flac via ffmpeg. Each chunk is written out
   * and stitched with the concat demuxer so multi-chunk recordings produce one
   * continuous file. Requires FFMPEG_PATH; otherwise we fail clearly.
   */
  private async transcode(webm: Buffer, format: AudioExportFormat): Promise<Buffer> {
    const ffmpegPath = this.config.get('export', { infer: true }).ffmpegPath;
    if (!ffmpegPath) {
      throw new BadRequestException(
        `${format.toUpperCase()} export requires ffmpeg. Set FFMPEG_PATH, or export 'webm' ` +
          `(lossless original), or use the web app's client-side WAV export.`,
      );
    }

    const dir = await mkdtemp(join(tmpdir(), 'echovault-export-'));
    try {
      const inputPath = join(dir, 'input.webm');
      await writeFile(inputPath, webm);
      const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath, ...ffmpegOutputArgs(format), 'pipe:1'];
      return await this.runFfmpeg(ffmpegPath, args);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private runFfmpeg(ffmpegPath: string, args: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      proc.stdout.on('data', (d: Buffer) => out.push(d));
      proc.stderr.on('data', (d: Buffer) => err.push(d));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(out));
        else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString()}`));
      });
    });
  }

  private toMdRecording(r: {
    title: string;
    sourceType: string;
    startedAt: Date;
    durationMs: number;
    tags: string[];
    notes: string | null;
  }) {
    return {
      title: r.title,
      sourceType: r.sourceType,
      startedAt: r.startedAt.toISOString(),
      durationMs: r.durationMs,
      tags: r.tags,
      notes: r.notes ?? undefined,
    };
  }

  private async getOwned(ownerId: string, recordingId: string) {
    const rec = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!rec) throw new NotFoundException('Recording not found');
    if (rec.ownerId !== ownerId) throw new ForbiddenException('Not your recording');
    return rec;
  }
}

/** Filesystem/header-safe slug from a recording title. */
function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'recording'
  );
}
