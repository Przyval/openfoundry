import { writeFileSync, readFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * On-disk persistence shared by the in-memory object and link stores.
 *
 * Both stores keep their data per ontology, and the file says so: it is
 * `{ formatVersion: 2, ontologies: { [ontologyRid]: <that ontology's data> } }`.
 *
 * The files written before that held one flat record for the whole
 * deployment, keyed by object type alone. Nothing in such a file records which
 * ontology an entry was written through, so it cannot be split back out by
 * ontology: serving it to every ontology would recreate the cross-ontology
 * reads this format exists to prevent, and handing it to any one of them would
 * be a guess. A file in that shape is therefore moved aside, intact, and the
 * store starts empty; the demo seeds repopulate it (`start.sh --reseed`).
 */

const FORMAT_VERSION = 2;

interface ScopedFile<T> {
  formatVersion: typeof FORMAT_VERSION;
  ontologies: Record<string, T>;
}

function isScopedFile(value: unknown): value is ScopedFile<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { formatVersion?: unknown }).formatVersion === FORMAT_VERSION &&
    typeof (value as { ontologies?: unknown }).ontologies === "object" &&
    (value as { ontologies?: unknown }).ontologies !== null
  );
}

/**
 * Reads the per-ontology records from `dataFile`.
 *
 * Returns an empty record when the file is absent or unreadable, matching the
 * stores' long-standing best-effort persistence. A file in the pre-scoping
 * shape that holds any data is renamed to `<dataFile>.unscoped-<epoch ms>` and
 * reported once on stderr, so its contents survive for anyone who needs them
 * while the store never serves them under an ontology they may not belong to.
 */
export function readOntologyScopedFile<T>(
  dataFile: string,
  label: string,
): Record<string, T> {
  let parsed: unknown;
  try {
    if (!existsSync(dataFile)) return {};
    parsed = JSON.parse(readFileSync(dataFile, "utf-8"));
  } catch {
    // Missing or corrupt: start empty, as these stores always have.
    return {};
  }

  if (isScopedFile(parsed)) return parsed.ontologies as Record<string, T>;

  const holdsData =
    typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0;
  if (holdsData) {
    const archived = `${dataFile}.unscoped-${Date.now()}`;
    try {
      renameSync(dataFile, archived);
      console.warn(
        `[${label}] ${dataFile} predates per-ontology storage: its entries do ` +
          `not record which ontology they belong to, so none of them can be ` +
          `served. Moved it to ${archived} and started empty; re-seed ` +
          `(start.sh --reseed) to repopulate.`,
      );
    } catch {
      // Leave the file where it is; the next save replaces it.
    }
  }
  return {};
}

/**
 * Writes the per-ontology records to `dataFile` atomically (write, then
 * rename), best-effort like the stores' persistence has always been.
 */
export function writeOntologyScopedFile<T>(
  dataFile: string,
  ontologies: Record<string, T>,
): void {
  try {
    mkdirSync(dirname(dataFile), { recursive: true });
    const content: ScopedFile<T> = { formatVersion: FORMAT_VERSION, ontologies };
    const tmpFile = dataFile + ".tmp";
    writeFileSync(tmpFile, JSON.stringify(content, null, 2), "utf-8");
    renameSync(tmpFile, dataFile);
  } catch {
    // Best-effort persistence - don't crash the service
  }
}
