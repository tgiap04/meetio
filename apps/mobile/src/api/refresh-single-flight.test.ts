import { createSingleFlight } from './refresh-single-flight';

describe('createSingleFlight', () => {
  it('shares one in-flight promise across concurrent callers', async () => {
    let calls = 0;
    let resolveOperation: (value: string) => void = () => undefined;
    const operation = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          calls += 1;
          resolveOperation = resolve;
        }),
    );

    const singleFlight = createSingleFlight(operation);

    // Three "concurrent" 401s each call the guarded refresh at the same tick.
    const first = singleFlight();
    const second = singleFlight();
    const third = singleFlight();

    resolveOperation('new-access-token');

    const results = await Promise.all([first, second, third]);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
    expect(results).toEqual(['new-access-token', 'new-access-token', 'new-access-token']);
  });

  it('allows a new operation once the previous one has settled', async () => {
    const operation = jest.fn().mockResolvedValueOnce('token-a').mockResolvedValueOnce('token-b');
    const singleFlight = createSingleFlight(operation);

    await expect(singleFlight()).resolves.toBe('token-a');
    await expect(singleFlight()).resolves.toBe('token-b');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight promise on failure so a retry can run a fresh operation', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValueOnce('token-a');
    const singleFlight = createSingleFlight(operation);

    await expect(singleFlight()).rejects.toThrow('refresh failed');
    await expect(singleFlight()).resolves.toBe('token-a');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('propagates the same rejection to every concurrent caller', async () => {
    let rejectOperation: (error: Error) => void = () => undefined;
    const operation = jest.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectOperation = reject;
        }),
    );
    const singleFlight = createSingleFlight(operation);

    const first = singleFlight();
    const second = singleFlight();

    rejectOperation(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
