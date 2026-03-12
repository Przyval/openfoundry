const SEGMENT_PATTERN = /^[a-z0-9-]+$/;
const LOCATOR_PATTERN = /^[a-zA-Z0-9._-]+$/;
const RID_PREFIX = "ri";

/**
 * An immutable Resource Identifier following the Palantir RID format:
 *
 *   ri.<service>.<instance>.<type>.<locator>
 *
 * The locator segment may contain dots, allowing hierarchical sub-addressing
 * (e.g. `ri.phonograph2-objects.main.object.v4.abc123.encoded-key`).
 */
export class Rid {
  readonly service: string;
  readonly instance: string;
  readonly type: string;
  readonly locator: string;

  private constructor(
    service: string,
    instance: string,
    type: string,
    locator: string,
  ) {
    this.service = service;
    this.instance = instance;
    this.type = type;
    this.locator = locator;
    Object.freeze(this);
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new RID from its constituent parts.
   * Each segment is validated before construction.
   */
  static create(
    service: string,
    instance: string,
    type: string,
    locator: string,
  ): Rid {
    validateSegment("service", service);
    validateSegment("instance", instance);
    validateSegment("type", type);
    validateLocator(locator);
    return new Rid(service, instance, type, locator);
  }

  /**
   * Parse a RID string of the form `ri.<service>.<instance>.<type>.<locator>`.
   *
   * The locator is everything after the fourth dot, so it may itself contain
   * dots (e.g. `v4.abc123.encoded-key`).
   */
  static parse(rid: string): Rid {
    if (typeof rid !== "string" || rid.length === 0) {
      throw new Error("RID must be a non-empty string");
    }

    const parts = rid.split(".");
    if (parts.length < 5) {
      throw new Error(
        `Invalid RID: expected at least 5 dot-separated segments, got ${parts.length} in "${rid}"`,
      );
    }

    const [prefix, service, instance, type, ...locatorParts] = parts;

    if (prefix !== RID_PREFIX) {
      throw new Error(
        `Invalid RID prefix: expected "${RID_PREFIX}", got "${prefix}" in "${rid}"`,
      );
    }

    const locator = locatorParts.join(".");

    validateSegment("service", service, rid);
    validateSegment("instance", instance, rid);
    validateSegment("type", type, rid);
    validateLocator(locator, rid);

    return new Rid(service, instance, type, locator);
  }

  // ---------------------------------------------------------------------------
  // Instance methods
  // ---------------------------------------------------------------------------

  /** Return the canonical string representation. */
  toString(): string {
    return `${RID_PREFIX}.${this.service}.${this.instance}.${this.type}.${this.locator}`;
  }

  /** Value-equality check. */
  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof Rid)) return false;
    return (
      this.service === other.service &&
      this.instance === other.instance &&
      this.type === other.type &&
      this.locator === other.locator
    );
  }

  /** Allow JSON.stringify to produce the string form. */
  toJSON(): string {
    return this.toString();
  }
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

function validateSegment(
  name: string,
  value: string,
  original?: string,
): void {
  if (!value || !SEGMENT_PATTERN.test(value)) {
    const ctx = original ? ` in "${original}"` : "";
    throw new Error(
      `Invalid RID ${name}: "${value}" must match ${SEGMENT_PATTERN}${ctx}`,
    );
  }
}

function validateLocator(value: string, original?: string): void {
  if (!value || !LOCATOR_PATTERN.test(value)) {
    const ctx = original ? ` in "${original}"` : "";
    throw new Error(
      `Invalid RID locator: "${value}" must match ${LOCATOR_PATTERN}${ctx}`,
    );
  }
}
