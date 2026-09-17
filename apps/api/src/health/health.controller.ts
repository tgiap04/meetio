import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';

class HealthResponseDto {
  status!: 'ok';
}

/**
 * Unauthenticated liveness probe — used by CI/deploy tooling and to prove the
 * Nest app boots and Swagger reflects a real controller.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
