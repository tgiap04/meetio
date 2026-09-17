import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';
import type { LoginRequest } from '@meetio/shared';

export class LoginDto implements LoginRequest {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password!: string;
}
