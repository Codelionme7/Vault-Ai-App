import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequestTranscriptionDto } from './dto/transcription.dto';
import { TranscriptionService } from './transcription.service';

@ApiTags('transcription')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings/:id')
export class TranscriptionController {
  constructor(private readonly transcription: TranscriptionService) {}

  @Post('transcribe')
  @ApiOperation({ summary: 'Request transcription (async, optional, never blocks recording)' })
  transcribe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestTranscriptionDto,
  ) {
    return this.transcription.request(user.id, id, dto);
  }

  @Get('transcript')
  @ApiOperation({ summary: 'Get the transcript (if generated)' })
  transcript(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transcription.getTranscript(user.id, id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get the generated summary (if any)' })
  summary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transcription.getSummary(user.id, id);
  }
}
