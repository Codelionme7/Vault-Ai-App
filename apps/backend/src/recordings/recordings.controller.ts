import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateRecordingDto, UpdateRecordingDto } from './dto/recording.dto';
import { RecordingsService } from './recordings.service';

@ApiTags('recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Post()
  @ApiOperation({ summary: 'Open a recording session (local-first; id may be client-supplied)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecordingDto) {
    return this.recordings.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my recordings (newest first)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.recordings.findAllForOwner(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recording' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recordings.findOneOwned(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update title / tags / notes' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecordingDto,
  ) {
    return this.recordings.update(user.id, id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Finalize a recording and recompute stats from chunks' })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recordings.complete(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a recording and all its chunks' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.recordings.remove(user.id, id);
  }
}
