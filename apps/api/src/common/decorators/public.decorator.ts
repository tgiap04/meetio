import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as exempt from the global `JwtAuthGuard`.
 *
 * Applied to `/auth/register`, `/auth/login`, `/auth/refresh` (api-spec §1)
 * and to `/health`. Everything else — including `/auth/logout`, which uses the
 * caller's own access token to know which refresh token to revoke — requires a
 * valid access token.
 *
 * `/health` must stay public: it is the liveness/readiness probe for Docker,
 * Kubernetes and load balancers, none of which carry a JWT. Putting it behind
 * the guard makes every probe fail while unit tests still pass, because those
 * call the controller directly and never traverse the guard.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
