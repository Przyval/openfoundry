// ---------------------------------------------------------------------------
// Embedding Hook  (Feature 8)
//
// Fire-and-forget hook that sends object properties to svc-aip for embedding
// generation whenever an object is created or updated.  Failures are caught
// silently so they never block the object upsert path.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddingsPayload {
  texts: string[];
  sourceRid?: string;
  sourceType?: string;
}

type OnObjectUpsert = (
  objectType: string,
  primaryKey: string,
  properties: Record<string, unknown>,
) => void;

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Convert an object's properties into a single text representation suitable
 * for embedding.  Format: "ObjectType: key=value, key=value, ..."
 */
function serializeProperties(
  objectType: string,
  properties: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    parts.push(`${key}=${String(value)}`);
  }
  return `${objectType}: ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create an embedding hook that sends property text to the AIP embedding
 * service on every object upsert.
 *
 * The returned function is fire-and-forget: it does **not** return a promise
 * and will never throw.  Any network or serialization errors are logged to
 * stderr but otherwise silently swallowed.
 *
 * @param aipServiceUrl  Base URL of svc-aip, e.g. "http://localhost:8092"
 */
export function createEmbeddingHook(aipServiceUrl: string): OnObjectUpsert {
  const embeddingsUrl = `${aipServiceUrl}/api/v2/aip/embeddings`;

  function onObjectUpsert(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): void {
    // Fire-and-forget — intentionally not awaited.
    void (async () => {
      try {
        const text = serializeProperties(objectType, properties);

        const payload: EmbeddingsPayload = {
          texts: [text],
          sourceRid: primaryKey,
          sourceType: objectType,
        };

        await fetch(embeddingsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Embedding failure must never break object creation.
        // In production this would go to a structured logger; for now
        // we write to stderr so it's visible in dev but non-blocking.
        console.error(
          `[embedding-hook] Failed to generate embedding for ${objectType}:${primaryKey}`,
        );
      }
    })();
  }

  return onObjectUpsert;
}
