import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { SearchQuery } from '@echovault/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search recordings by title, notes, tags, source, date, transcript' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'sourceType', required: false })
  @ApiQuery({ name: 'tags', required: false, isArray: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'includeTranscript', required: false, type: Boolean })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('sourceType') sourceType?: string,
    @Query('tags') tags?: string | string[],
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeTranscript') includeTranscript?: string,
  ) {
    const query: SearchQuery = {
      q,
      sourceType,
      tags: tags === undefined ? undefined : Array.isArray(tags) ? tags : [tags],
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      includeTranscript: includeTranscript === 'true',
    };
    return this.search.search(user.id, query);
  }
}
