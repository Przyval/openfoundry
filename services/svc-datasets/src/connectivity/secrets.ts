import { createCipheriv, randomBytes } from "node:crypto";
import { secretsKeyNotConfigured } from "./errors.js";

/**
 * Encrypts connection secrets before a store keeps them.
 *
 * No served operation reads a secret back - the API only ever returns the
 * secret's *name* - so there is no `open`; whatever later runs an import
 * decrypts with the same key. AES-256-GCM, a fresh 12-byte IV per secret, the
 * result stored as `iv.tag.ciphertext` in base64.
 */
export class SecretBox {
  private constructor(private readonly key: Buffer | undefined) {}

  /**
   * `CONNECTIVITY_SECRETS_KEY` is a base64 32-byte key. Without one, the memory
   * store uses a throwaway key (nothing outlives the process anyway), while a
   * database-backed store refuses to write a secret rather than keep one it
   * could never decrypt after a restart.
   */
  static fromEnv(env: NodeJS.ProcessEnv, persistent: boolean): SecretBox {
    const raw = env.CONNECTIVITY_SECRETS_KEY;
    if (raw) {
      const key = Buffer.from(raw, "base64");
      if (key.length !== 32) {
        throw new Error("CONNECTIVITY_SECRETS_KEY must be a base64-encoded 32-byte key");
      }
      return new SecretBox(key);
    }
    return new SecretBox(persistent ? undefined : randomBytes(32));
  }

  static withKey(key: Buffer): SecretBox {
    return new SecretBox(key);
  }

  seal(plaintext: string): string {
    if (!this.key) throw secretsKeyNotConfigured();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64")).join(".");
  }
}
