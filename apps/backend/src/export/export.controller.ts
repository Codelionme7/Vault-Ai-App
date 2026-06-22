import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AUDIO_EXPORT_FORMATS, type AudioExportFormat } from './audio-export';
import {
  type ExportFile,
  ExportService,
  type SummaryFormat,
  type TranscriptFormat,
} from './export.service';

const TRANSCRIPT_FORMATS: TranscriptFormat[] = ['txt', 'vtt', 'srt', 'md'];
const SUMMARY_FORMATS: SummaryFormat[] = ['md', 'pdf'];

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings/:id/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('zip')
  @ApiOperation({ summary: 'Download a ZIP bundle (audio + transcript + notes + metadata)' })
  async zip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.exportService.exportZip(user.id, id));
  }

  @Get('audio')
  @ApiOperation({ summary: 'Download audio (webm always; wav/mp3/flac need ffmpeg)' })
  @ApiQuery({ name: 'format', enum: AUDIO_EXPORT_FORMATS, required: false })
  @ApiQuery({ name: 'channel', required: false })
  async audio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('format') format = 'webm',
    @Query('channel') channel?: string,
  ): Promise<void> {
    const fmt = pick(format, AUDIO_EXPORT_FORMATS, 'webm') as AudioExportFormat;
    send(res, await this.exportService.exportAudio(user.id, id, fmt, channel));
  }

  @Get('transcript')
  @ApiOperation({ summary: 'Download the transcript (txt | vtt | srt | md)' })
  @ApiQuery({ name: 'format', enum: TRANSCRIPT_FORMATS, required: false })
  async transcript(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('format') format = 'txt',
  ): Promise<void> {
    const fmt = pick(format, TRANSCRIPT_FORMATS, 'txt');
    send(res, await this.exportService.exportTranscript(user.id, id, fmt));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Download the summary / notes (md | pdf)' })
  @ApiQuery({ name: 'format', enum: SUMMARY_FORMATS, required: false })
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('format') format = 'md',
  ): Promise<void> {
    const fmt = pick(format, SUMMARY_FORMATS, 'md');
    send(res, await this.exportService.exportSummary(user.id, id, fmt));
  }
}

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function send(res: Response, file: ExportFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', file.bytes.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(file.bytes);
}
