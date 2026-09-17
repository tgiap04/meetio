/**
 * Access-token claims. `jti` is the id of the refresh-token row this access
 * token was issued alongside — it is how `POST /auth/logout` knows which
 * refresh token to revoke without a request body (api-spec §1: logout takes
 * no fields; see `AuthService.logout`).
 */
export interface JwtPayload {
  sub: string;
  jti: string;
}

/** What `JwtStrategy.validate` attaches to `req.user`. */
export interface AuthenticatedUser {
  userId: string;
  jti: string;
}
