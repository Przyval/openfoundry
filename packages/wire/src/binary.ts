/**
 * Base64 binary encoding for Conjure wire format.
 *
 * Conjure represents binary data as base64-encoded strings in JSON.
 */

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Encodes a Uint8Array to a base64 string.
 */
export function toWireBase64(buffer: Uint8Array): string {
  // Use built-in btoa if available (Node 16+, browsers)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  let result = "";
  const len = buffer.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = buffer[i]!;
    const b1 = i + 1 < len ? buffer[i + 1]! : 0;
    const b2 = i + 2 < len ? buffer[i + 2]! : 0;

    result += BASE64_CHARS[(b0 >> 2) & 0x3f];
    result += BASE64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? BASE64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

/**
 * Decodes a base64 string to a Uint8Array.
 */
export function fromWireBase64(wire: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(wire, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  // Manual decode fallback
  const cleaned = wire.replace(/=+$/, "");
  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = BASE64_CHARS.indexOf(cleaned[i]!);
    const b = BASE64_CHARS.indexOf(cleaned[i + 1]!);
    const c = i + 2 < cleaned.length ? BASE64_CHARS.indexOf(cleaned[i + 2]!) : 0;
    const d = i + 3 < cleaned.length ? BASE64_CHARS.indexOf(cleaned[i + 3]!) : 0;

    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < cleaned.length) bytes[p++] = ((b << 4) | (c >> 2)) & 0xff;
    if (i + 3 < cleaned.length) bytes[p++] = ((c << 6) | d) & 0xff;
  }

  return bytes;
}
