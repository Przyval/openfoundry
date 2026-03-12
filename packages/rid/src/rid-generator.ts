import { createHash } from "node:crypto";
import { Rid } from "./rid.js";

const DEFAULT_INSTANCE = "main";

/**
 * Generate a RID with a random UUID v4 locator.
 *
 * @param service - The service namespace (e.g. "compass", "ontology").
 * @param type    - The resource type (e.g. "folder", "object-type").
 * @param instance - The instance segment. Defaults to "main".
 */
export function generateRid(
  service: string,
  type: string,
  instance: string = DEFAULT_INSTANCE,
): Rid {
  const locator = crypto.randomUUID();
  return Rid.create(service, instance, type, locator);
}

/**
 * Generate a deterministic RID by hashing the provided content string.
 *
 * This is useful when you need a stable identifier derived from some
 * canonical representation of a resource (e.g. a schema definition).
 *
 * @param service - The service namespace.
 * @param type    - The resource type.
 * @param content - Arbitrary string whose SHA-256 hash becomes the locator.
 * @param instance - The instance segment. Defaults to "main".
 */
export function generateDeterministicRid(
  service: string,
  type: string,
  content: string,
  instance: string = DEFAULT_INSTANCE,
): Rid {
  const hash = createHash("sha256").update(content).digest("hex");
  return Rid.create(service, instance, type, hash);
}
