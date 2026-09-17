import { buildStartupUrls, toDisplayUrl } from './startup-urls.js';

describe('toDisplayUrl', () => {
  it.each([
    ['http://[::1]:3000', 'http://localhost:3000'],
    ['http://[::]:3000', 'http://localhost:3000'],
    ['http://0.0.0.0:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000', 'http://localhost:3000'],
  ])('rewrites the unclickable bind address %p to %p', (raw, expected) => {
    expect(toDisplayUrl(raw)).toBe(expected);
  });

  it.each([
    ['http://192.168.1.20:3000', 'http://192.168.1.20:3000'],
    ['https://api.meetio.test', 'https://api.meetio.test'],
  ])('leaves a deliberately chosen host %p alone', (raw, expected) => {
    // Binding to one specific interface is a decision; rewriting it would hide it.
    expect(toDisplayUrl(raw)).toBe(expected);
  });

  it('strips trailing slashes so joins do not double up', () => {
    expect(toDisplayUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });

  it('returns the input untouched rather than throwing on a malformed url', () => {
    // A log line must never be the reason boot fails.
    expect(toDisplayUrl('not a url')).toBe('not a url');
  });
});

describe('buildStartupUrls', () => {
  it('joins the global prefix onto the api url', () => {
    expect(buildStartupUrls('http://[::1]:3000', 'api', 'api/docs')).toEqual({
      api: 'http://localhost:3000/api',
      docs: 'http://localhost:3000/api/docs',
    });
  });

  it('returns docs: null when Swagger is not served', () => {
    // Printing a docs link that answers 404 would be worse than printing nothing.
    expect(buildStartupUrls('http://[::1]:3000', 'api', null)).toEqual({
      api: 'http://localhost:3000/api',
      docs: null,
    });
  });

  it('handles a prefix given with slashes around it', () => {
    expect(buildStartupUrls('http://localhost:3000', '/api/', 'api/docs').api).toBe(
      'http://localhost:3000/api',
    );
  });

  it('omits the prefix segment when there is no global prefix', () => {
    expect(buildStartupUrls('http://localhost:3000', '', null).api).toBe('http://localhost:3000');
  });
});
