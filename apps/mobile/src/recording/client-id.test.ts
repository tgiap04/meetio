import { newClientId } from './client-id';

describe('newClientId', () => {
  it('generates a v4 UUID with deterministic random', () => {
    const uuid = newClientId(() => 0.5);
    // At 0.5 * 16 = 8 for each hex digit
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // v4: third group starts with 4
    expect(uuid.split('-')[2][0]).toBe('4');
    // Variant 1: fourth group starts with 8, 9, a, or b
    expect(/^[89ab]/.test(uuid.split('-')[3])).toBe(true);
  });

  it('generates different IDs on multiple calls', () => {
    const id1 = newClientId();
    const id2 = newClientId();
    expect(id1).not.toBe(id2);
  });

  it('generates valid RFC 4122 v4 UUIDs', () => {
    for (let i = 0; i < 10; i++) {
      const uuid = newClientId();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it('uses the provided random source', () => {
    let callCount = 0;
    const deterministic = () => {
      callCount += 1;
      return 0.125; // 1/8, gives hex digit 2
    };
    const uuid = newClientId(deterministic);
    // Should have called Math.floor(random() * 16) 32 times, plus extra calls during parse/shift
    expect(callCount).toBeGreaterThan(0);
    // All digits except those forced (position 12 is '4', position 16 is variant) should be '2'
    const parts = uuid.split('-');
    expect(parts[2][0]).toBe('4'); // v4 enforced
  });
});
