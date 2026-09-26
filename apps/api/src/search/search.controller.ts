import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UserThrottlerGuard } from '../common/throttler/user-throttler.guard.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { SearchService } from './search.service.js';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto.js';

/** api-spec §6 `GET /search` — 60 requests / minute / user (§10). */
@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(UserThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Semantic search across your meetings; results point at the transcript seq' })
  @ApiOkResponse({ type: SearchResponseDto })
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    return this.searchService.search(user.userId, query);
  }
}
