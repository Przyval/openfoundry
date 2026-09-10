/**
 * Data Fetcher — queries svc-objects for threshold evaluation.
 *
 * Used by the scheduler to check if alert conditions are met
 * (e.g., "any KelavaKPI with completionRate < 50").
 */

export interface ThresholdQuery {
  objectType: string;
  property: string;
  operator: "lt" | "gt" | "lte" | "gte" | "eq";
  value: number | string;
}

export interface ThresholdResult {
  violated: boolean;
  matchCount: number;
  objects: Array<{ primaryKey: string; properties: Record<string, unknown> }>;
}

export class DataFetcher {
  constructor(private readonly objectsBaseUrl: string) {}

  /**
   * Find the first ontology that contains the given objectType.
   */
  private async findOntologyRid(objectType: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.objectsBaseUrl}/api/v2/ontologies`);
      if (!res.ok) return null;
      const data = (await res.json()) as { data: Array<{ rid: string }> };
      for (const ont of data.data) {
        const metaRes = await fetch(`${this.objectsBaseUrl}/api/v2/ontologies/${ont.rid}/fullMetadata`);
        if (!metaRes.ok) continue;
        const meta = (await metaRes.json()) as { objectTypes: Array<{ apiName: string }> };
        if (meta.objectTypes.some((ot) => ot.apiName === objectType)) {
          return ont.rid;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Query objects matching a threshold condition.
   */
  async evaluateThreshold(query: ThresholdQuery): Promise<ThresholdResult> {
    const ontRid = await this.findOntologyRid(query.objectType);
    if (!ontRid) return { violated: false, matchCount: 0, objects: [] };

    const filterMap: Record<string, string> = {
      lt: "LT", gt: "GT", lte: "LTE", gte: "GTE", eq: "EQUALS",
    };
    const filterType = filterMap[query.operator] ?? "LT";

    try {
      const res = await fetch(
        `${this.objectsBaseUrl}/api/v2/ontologies/${ontRid}/objectSets/loadObjects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectSet: {
              type: "filter",
              objectSet: { type: "base", objectType: query.objectType },
              where: {
                type: filterType,
                property: query.property,
                value: query.value,
              },
            },
            pageSize: 100,
          }),
        },
      );

      if (!res.ok) return { violated: false, matchCount: 0, objects: [] };
      const data = (await res.json()) as {
        data: Array<{ primaryKey: string; properties: Record<string, unknown> }>;
      };
      const matches = data.data ?? [];

      return {
        violated: matches.length > 0,
        matchCount: matches.length,
        objects: matches.map((o) => ({
          primaryKey: o.primaryKey,
          properties: o.properties,
        })),
      };
    } catch {
      return { violated: false, matchCount: 0, objects: [] };
    }
  }

  /**
   * Count objects matching a simple filter.
   */
  async countObjects(objectType: string, filter?: Record<string, unknown>): Promise<number> {
    const ontRid = await this.findOntologyRid(objectType);
    if (!ontRid) return 0;

    const objectSet = filter
      ? { type: "filter", objectSet: { type: "base", objectType }, where: filter }
      : { type: "base", objectType };

    try {
      const res = await fetch(
        `${this.objectsBaseUrl}/api/v2/ontologies/${ontRid}/objectSets/aggregate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectSet, aggregation: [{ type: "count" }] }),
        },
      );
      if (!res.ok) return 0;
      const data = (await res.json()) as { data: Array<{ value?: number; metrics?: { count: number } }> };
      return data.data?.[0]?.value ?? data.data?.[0]?.metrics?.count ?? 0;
    } catch {
      return 0;
    }
  }
}
