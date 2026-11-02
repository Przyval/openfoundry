/**
 * Data Fetcher — queries svc-objects for threshold evaluation.
 *
 * Used by the scheduler to check if alert conditions are met
 * (e.g., "any KelavaKPI with completionRate < 50").
 *
 * An object type's API name is unique only within one ontology, so every read
 * goes through one ontology. A monitor that names none reads from the single
 * ontology that declares its object type; none or several is an error rather
 * than a silent "not violated".
 */

export interface ThresholdQuery {
  objectType: string;
  ontologyRid?: string;
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
  constructor(
    private readonly objectsBaseUrl: string,
    private readonly ontologyBaseUrl: string,
  ) {}

  /**
   * The ontology to read `objectType` from: the one given, else the single
   * ontology that declares the type.
   */
  private async resolveOntologyRid(
    objectType: string,
    ontologyRid: string | undefined,
  ): Promise<string> {
    if (ontologyRid) return ontologyRid;

    const declaring: string[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams();
      if (pageToken) qs.set("pageToken", pageToken);
      const res = await fetch(`${this.ontologyBaseUrl}/api/v2/ontologies?${qs}`);
      if (!res.ok) throw new Error(`Failed to list ontologies: HTTP ${res.status}`);
      const body = (await res.json()) as { data: Array<{ rid: string }>; nextPageToken?: string };
      for (const ont of body.data) {
        const typeRes = await fetch(
          `${this.ontologyBaseUrl}/api/v2/ontologies/${encodeURIComponent(ont.rid)}/objectTypes/${encodeURIComponent(objectType)}`,
        );
        if (typeRes.ok) declaring.push(ont.rid);
        else if (typeRes.status !== 404) {
          throw new Error(
            `Failed to read object type ${objectType} in ontology ${ont.rid}: HTTP ${typeRes.status}`,
          );
        }
      }
      pageToken = body.nextPageToken;
    } while (pageToken);

    if (declaring.length === 1) return declaring[0];
    if (declaring.length === 0) throw new Error(`No ontology declares object type ${objectType}`);
    throw new Error(
      `Object type ${objectType} is declared by ${declaring.length} ontologies ` +
        `(${declaring.join(", ")}); set the monitor's ontologyRid`,
    );
  }

  /**
   * Query objects matching a threshold condition.
   */
  async evaluateThreshold(query: ThresholdQuery): Promise<ThresholdResult> {
    const ontRid = await this.resolveOntologyRid(query.objectType, query.ontologyRid);

    const filterMap: Record<string, string> = {
      lt: "LT", gt: "GT", lte: "LTE", gte: "GTE", eq: "EQUALS",
    };
    const filterType = filterMap[query.operator] ?? "LT";

    const res = await fetch(
      `${this.objectsBaseUrl}/api/v2/ontologies/${encodeURIComponent(ontRid)}/objectSets/loadObjects`,
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

    if (!res.ok) {
      throw new Error(`Failed to load ${query.objectType} objects: HTTP ${res.status}`);
    }
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
  }

  /**
   * Count objects matching a simple filter.
   */
  async countObjects(
    objectType: string,
    filter?: Record<string, unknown>,
    ontologyRid?: string,
  ): Promise<number> {
    const ontRid = await this.resolveOntologyRid(objectType, ontologyRid);

    const objectSet = filter
      ? { type: "filter", objectSet: { type: "base", objectType }, where: filter }
      : { type: "base", objectType };

    const res = await fetch(
      `${this.objectsBaseUrl}/api/v2/ontologies/${encodeURIComponent(ontRid)}/objectSets/aggregate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectSet, aggregation: [{ type: "count" }] }),
      },
    );
    if (!res.ok) throw new Error(`Failed to count ${objectType} objects: HTTP ${res.status}`);
    const data = (await res.json()) as { data: Array<{ value?: number; metrics?: { count: number } }> };
    return data.data?.[0]?.value ?? data.data?.[0]?.metrics?.count ?? 0;
  }
}
