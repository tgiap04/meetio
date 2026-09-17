import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import type { UpdateMeRequest } from '@meetio/shared';

export class UpdateMeDto implements UpdateMeRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  display_name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null keeps meetings forever' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  retention_days?: number | null;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  notification_settings?: Record<string, boolean>;
}

/** Runtime guard for `notification_settings` values — `class-validator` checks
 * the object shape but not that every value inside is actually a boolean. */
export function assertBooleanValues(settings: Record<string, unknown>): asserts settings is Record<string, boolean> {
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'boolean') {
      throw new TypeError(`notification_settings.${key} must be a boolean`);
    }
  }
}
