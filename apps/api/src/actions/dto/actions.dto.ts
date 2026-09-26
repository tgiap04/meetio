import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ActionStatus, type ActionListQuery, type CreateActionItemRequest, type UpdateActionItemRequest } from '@meetio/shared';

const STATUSES = Object.values(ActionStatus);
const DATE_ONLY = { strict: true } as const;

export class ActionListQueryDto implements ActionListQuery {
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignee_entity_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() meeting_id?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number;
}

export class CreateActionItemDto implements CreateActionItemRequest {
  @ApiProperty() @IsString() @Length(1, 500) content!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  assignee_entity_id?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601(DATE_ONLY)
  @Length(10, 10)
  due_date?: string | null;
}

export class UpdateActionItemDto implements UpdateActionItemRequest {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) content?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null clears the assignee' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  assignee_entity_id?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'YYYY-MM-DD; null clears it' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601(DATE_ONLY)
  @Length(10, 10)
  due_date?: string | null;

  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: ActionStatus;
}
