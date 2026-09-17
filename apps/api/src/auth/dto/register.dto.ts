import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';
import type { RegisterRequest } from '@meetio/shared';

export class RegisterDto implements RegisterRequest {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'a-strong-password' })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Length(1, 200)
  display_name!: string;
}
