import { Marking, MarkingType } from "./marking-types.js";

/**
 * Evaluates access based on mandatory and discretionary markings.
 *
 * Access rules:
 * - User must possess ALL mandatory markings on a resource.
 * - If the resource has any discretionary markings, user must possess
 *   at least ONE of them.
 */
export class MarkingEvaluator {
  private readonly markings = new Map<string, Marking>();
  private readonly userMarkings = new Map<string, Set<string>>();

  /**
   * Register a marking definition so the evaluator knows its type.
   */
  registerMarking(marking: Marking): void {
    this.markings.set(marking.markingId, marking);
  }

  /**
   * Assign a set of marking IDs to a user (identified by RID).
   */
  setUserMarkings(userRid: string, markingIds: string[]): void {
    this.userMarkings.set(userRid, new Set(markingIds));
  }

  /**
   * Check whether a user can access a resource that carries the given markings.
   */
  canAccess(userRid: string, resourceMarkings: string[]): boolean {
    const userSet = this.userMarkings.get(userRid);
    if (!userSet) {
      return resourceMarkings.length === 0;
    }

    const mandatory: string[] = [];
    const discretionary: string[] = [];

    for (const markingId of resourceMarkings) {
      const marking = this.markings.get(markingId);
      if (!marking) {
        // Unknown markings are treated as mandatory for safety.
        mandatory.push(markingId);
        continue;
      }
      if (marking.type === MarkingType.MANDATORY) {
        mandatory.push(markingId);
      } else {
        discretionary.push(markingId);
      }
    }

    // User must have ALL mandatory markings.
    for (const m of mandatory) {
      if (!userSet.has(m)) {
        return false;
      }
    }

    // If there are discretionary markings, user must have at least one.
    if (discretionary.length > 0) {
      const hasAny = discretionary.some((d) => userSet.has(d));
      if (!hasAny) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter a list of resources, returning only those the user can access.
   */
  filterAccessible<T extends { markings: string[] }>(
    userRid: string,
    resources: T[],
  ): T[] {
    return resources.filter((r) => this.canAccess(userRid, r.markings));
  }
}
