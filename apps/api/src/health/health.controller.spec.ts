import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller.js';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

describe('HealthController', () => {
  it('reports ok', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok' });
  });

  // Regression guard: Phase 03 added a GLOBAL JwtAuthGuard, which silently put
  // /api/health behind auth (curl returned 401 where it had returned 200).
  // Unit tests did not catch it because they invoke the controller directly and
  // never traverse the guard. A 401 here breaks Docker healthchecks, Kubernetes
  // liveness/readiness probes and load-balancer checks.
  it('stays exempt from the global JwtAuthGuard', () => {
    const isPublic = new Reflector().get<boolean>(IS_PUBLIC_KEY, HealthController);
    expect(isPublic).toBe(true);
  });
});
