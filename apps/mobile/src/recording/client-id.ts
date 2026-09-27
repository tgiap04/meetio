/**
 * RFC 4122 v4 UUID for a meeting created on the device (it must exist before the server does,
 * for an offline start). Math.random is enough: the id is not a secret — the server scopes every
 * meeting to its owner and answers someone else's id with MEETING_NOT_FOUND.
 */
export function newClientId(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
