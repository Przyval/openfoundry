import type { FastifyBaseLogger } from "fastify";
import { generateKeyPair, type CryptoKey } from "jose";
import {
  importSigningKey,
  importVerificationKey,
  type ImportedKey,
} from "@openfoundry/auth-tokens";
import { warnIfHalfConfigured, type MultipassConfig } from "./config.js";

/** Key type compatible with jose v5 (KeyLike) and v6 (CryptoKey). */
export type SigningKey = ImportedKey | CryptoKey | Uint8Array;

export interface SigningKeyPair {
  privateKey: SigningKey;
  publicKey: SigningKey;
}

/**
 * The one key pair every route signs and verifies with: the configured pair,
 * or an ephemeral one generated here when none is configured. Resolved once
 * per server, so a token minted by one route verifies at another.
 */
export async function resolveSigningKeys(
  config: Pick<MultipassConfig, "jwtPrivateKey" | "jwtPublicKey">,
  log: FastifyBaseLogger,
): Promise<SigningKeyPair> {
  if (config.jwtPrivateKey && config.jwtPublicKey) {
    return {
      privateKey: await importSigningKey(config.jwtPrivateKey),
      publicKey: await importVerificationKey(config.jwtPublicKey),
    };
  }

  warnIfHalfConfigured({ log }, config);
  // Extractable because jose hands it to KeyObject.from, which deprecates
  // non-extractable keys. It never leaves this process either way.
  const keyPair = await generateKeyPair("ES256", { extractable: true });
  log.warn("No JWT keys configured - generated ephemeral ES256 key pair. Do NOT use in production.");
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
}
