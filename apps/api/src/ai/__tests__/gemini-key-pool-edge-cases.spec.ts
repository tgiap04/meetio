import { cooldownFor } from '../gemini-key-pool.js';

describe('gemini key pool edge cases', () => {
  it('parses retryDelay with decimal values like "12.5s"', () => {
    const error = new Error('{"error":{"details":[{"retryDelay":"12.5s"}]}}');
    const cooldown = cooldownFor(error, 60_000, Date.now());
    expect(cooldown).toBe(12_500);
  });

  it('parses retryDelay with large decimal values', () => {
    const error = new Error('{"error":{"details":[{"retryDelay":"45.75s"}]}}');
    const cooldown = cooldownFor(error, 60_000, Date.now());
    expect(cooldown).toBe(45_750);
  });

  it('ignores retryDelay if it would be less than 1 second', () => {
    const error = new Error('{"error":{"details":[{"retryDelay":"0.5s"}]}}');
    const cooldown = cooldownFor(error, 60_000, Date.now());
    expect(cooldown).toBe(1_000); // Minimum is 1 second
  });

  it('handles RESOURCE_EXHAUSTED errors with retryDelay', () => {
    const error = new Error('{"error":{"code":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"30s"}]}}');
    const cooldown = cooldownFor(error, 60_000, Date.now());
    expect(cooldown).toBe(30_000);
  });

  it('handles quota exceeded with quotaId field', () => {
    const error = new Error(
      '{"error":{"code":"RESOURCE_EXHAUSTED","details":[{"errorInfo":{"reason":"RESOURCE_EXHAUSTED","domain":"googleapis.com"},"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}]}}'
    );
    const now = Date.UTC(2026, 8, 26, 3, 0, 0); // 20:00 PDT on 25/09
    const cooldown = cooldownFor(error, 60_000, now);
    // Should recognize daily quota and sleep until next Pacific day
    expect(cooldown).toBeGreaterThan(60_000);
  });
});
