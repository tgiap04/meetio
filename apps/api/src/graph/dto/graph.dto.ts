import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { EntityType, type EntityListQuery, type MergeEntitiesRequest, type UpdateEntityRequest } from '@meetio/shared';

const TYPES = Object.values(EntityType);

export class EntityListQueryDto implements EntityListQuery {
  @ApiPropertyOptional({ description: 'One type or a comma list, e.g. `organization,product,other`' })
  @IsOptional()
  @Matches(new RegExp(`^(${TYPES.join('|')})(,(${TYPES.join('|')}))*$`))
  type?: string;

  @ApiPropertyOptional({ description: 'Name or alias contains (accents and case ignored)' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
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

export class TimelineQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
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

export class UpdateEntityDto implements UpdateEntityRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  canonical_name?: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: EntityType;
}

export class MergeEntitiesDto implements MergeEntitiesRequest {
  @ApiProperty() @IsUUID() keep_id!: string;

  @ApiProperty({ type: [String] })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  merge_ids!: string[];
}
