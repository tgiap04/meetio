/**
 * Token lifetimes are fixed by api-spec §1 ("Access token sống 15 phút,
 * refresh token 60 ngày và xoay vòng mỗi lần dùng") — deliberately NOT
 * environment config, because these two values are a security contract
 * shared with the mobile client, not a per-deployment knob.
 *
 * `.env` previously carried unused `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`
 * entries (one of which said 30 days, contradicting the spec's 60). They
 * were removed: config that silently does nothing is worse than no config,
 * because it reads as a working lever.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/** Fixed passphrase hashed once at boot (`AuthService`) so a login attempt
 * against a non-existent email still pays argon2's verify cost — no
 * email-enumeration timing side channel between "wrong password" and
 * "no such account". */
export const TIMING_SAFETY_PASSPHRASE = 'meetio-timing-safety-dummy-passphrase';
