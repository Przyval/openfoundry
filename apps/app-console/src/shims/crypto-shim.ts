/**
 * Browser shim for node:crypto.
 * Only timingSafeEqual is imported by @openfoundry/auth-tokens,
 * but it's never actually called in the browser context.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function randomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf;
}

export function createHmac() {
  throw new Error("createHmac is not available in the browser");
}

export default { timingSafeEqual, randomBytes, createHmac };
