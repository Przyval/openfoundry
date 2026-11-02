import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt, Node's built-in KDF.
 *
 * The stored form is `<salt hex>:<derived key hex>`, which is what the
 * `users.password_hash` column holds.
 */

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  try {
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const keyBuffer = Buffer.from(key, "hex");
    if (derived.length !== keyBuffer.length) return false;
    return timingSafeEqual(derived, keyBuffer);
  } catch {
    return false;
  }
}

/** The shortest password an operator may set. */
export const MIN_PASSWORD_LENGTH = 8;
