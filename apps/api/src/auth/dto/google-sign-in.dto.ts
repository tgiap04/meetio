import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { GoogleSignInRequest } from '@meetio/shared';

/** Exactly one field, by design — the server never accepts email or a user
 * id from the client (phase-03 §Bảo mật §1). Everything else about identity
 * is read from the verified token, never from this body. */
export class GoogleSignInDto implements GoogleSignInRequest {
  @ApiProperty({ description: 'Google ID token from the client-side sign-in SDK' })
  @IsString()
  @IsNotEmpty()
  id_token!: string;
}
