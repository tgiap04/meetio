import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { DeleteMeRequest } from '@meetio/shared';

export class DeleteMeDto implements DeleteMeRequest {
  @ApiProperty({ description: 'Current password, required to confirm account deletion' })
  @IsString()
  @MinLength(1)
  password!: string;
}
