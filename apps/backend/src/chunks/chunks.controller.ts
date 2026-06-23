import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ChunksService } from './chunks.service';
import { CommitChunkDto, RequestUploadTargetDto } from './dto/chunk.dto';

@ApiTags('chunks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chunks')
export class ChunksController {
  constructor(private readonly chunks: ChunksService) {}

  @Post('upload-target')
  @ApiOperation({ summary: 'Get a place to upload a chunk (presigned URL or API path)' })
  uploadTarget(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestUploadTargetDto) {
    return this.chunks.requestUploadTarget(user.id, dto);
  }

  @Put('upload')
  @ApiOperation({ summary: 'Upload raw chunk bytes (local storage driver path)' })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Query('key') key: string,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    // `req.body` is a Buffer thanks to the express.raw middleware bound to this
    // path in main.ts.
    const bytes = req.body as Buffer;
    await this.chunks.storeBytes(user.id, key, bytes);
    return { ok: true };
  }

  @Post('commit')
  @ApiOperation({ summary: 'Commit chunk metadata after upload (idempotent)' })
  commit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CommitChunkDto) {
    return this.chunks.commit(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List chunks for a recording' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('recordingId') recordingId: string) {
    return this.chunks.listForRecording(user.id, recordingId);
  }

  @Get(':id/data')
  @ApiOperation({ summary: 'Stream a decrypted chunk (or redirect to a presigned URL)' })
  async data(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    // Prefer a direct-from-storage download where possible (S3 + unencrypted),
    // so large chunks bypass the API — essential under serverless body limits.
    const url = await this.chunks.getDownloadUrl(user.id, id);
    if (url) {
      res.redirect(302, url);
      return;
    }
    const { bytes, mimeType } = await this.chunks.getBytes(user.id, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.end(bytes);
  }
}
