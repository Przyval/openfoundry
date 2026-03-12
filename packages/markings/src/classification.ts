import { ClassificationLevel, SecurityClassification } from "./marking-types.js";

/**
 * Ordered hierarchy from lowest to highest classification.
 */
export const CLASSIFICATION_HIERARCHY: readonly ClassificationLevel[] = [
  ClassificationLevel.UNCLASSIFIED,
  ClassificationLevel.CONFIDENTIAL,
  ClassificationLevel.SECRET,
  ClassificationLevel.TOP_SECRET,
] as const;

function levelIndex(level: ClassificationLevel): number {
  return CLASSIFICATION_HIERARCHY.indexOf(level);
}

/**
 * Format a SecurityClassification as a human-readable banner string.
 *
 * Examples:
 *   - { level: TOP_SECRET, compartments: ["SI"], releasableTo: ["USA", "GBR"] }
 *     => "TOP SECRET//SI//REL TO USA, GBR"
 *   - { level: SECRET, compartments: [], releasableTo: [] }
 *     => "SECRET"
 */
export function classificationToString(sc: SecurityClassification): string {
  const levelStr = sc.level === ClassificationLevel.TOP_SECRET
    ? "TOP SECRET"
    : sc.level;

  const parts: string[] = [levelStr];

  if (sc.compartments.length > 0) {
    parts.push(sc.compartments.join("/"));
  }

  if (sc.releasableTo.length > 0) {
    parts.push(`REL TO ${sc.releasableTo.join(", ")}`);
  }

  return parts.join("//");
}

/**
 * Parse a classification banner string back into a SecurityClassification.
 *
 * Accepts strings produced by `classificationToString`.
 */
export function parseClassification(str: string): SecurityClassification {
  const segments = str.split("//").map((s) => s.trim());

  const levelStr = segments[0];
  let level: ClassificationLevel;

  switch (levelStr) {
    case "TOP SECRET":
      level = ClassificationLevel.TOP_SECRET;
      break;
    case "SECRET":
      level = ClassificationLevel.SECRET;
      break;
    case "CONFIDENTIAL":
      level = ClassificationLevel.CONFIDENTIAL;
      break;
    case "UNCLASSIFIED":
      level = ClassificationLevel.UNCLASSIFIED;
      break;
    default:
      throw new Error(`Unknown classification level: ${levelStr}`);
  }

  let compartments: string[] = [];
  let releasableTo: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.startsWith("REL TO ")) {
      releasableTo = seg
        .slice("REL TO ".length)
        .split(",")
        .map((s) => s.trim());
    } else {
      compartments = seg.split("/").map((s) => s.trim());
    }
  }

  return { level, compartments, releasableTo };
}

/**
 * Check whether a user's classification level meets or exceeds
 * the resource's required level.
 */
export function meetsClassification(
  userLevel: ClassificationLevel,
  resourceLevel: ClassificationLevel,
): boolean {
  return levelIndex(userLevel) >= levelIndex(resourceLevel);
}
