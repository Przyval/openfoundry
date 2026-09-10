/**
 * useObjectSetQuery — React hook for querying ObjectSets.
 *
 * Wraps the OpenFoundry ObjectSet API (loadObjects + aggregate)
 * with React state management, loading, and error handling.
 */

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

interface ObjectSetFilter {
  type: string;
  property?: string;
  value?: unknown;
  [key: string]: unknown;
}

interface UseObjectSetQueryOptions {
  ontologyRid: string;
  objectType: string;
  filter?: ObjectSetFilter;
  pageSize?: number;
  enabled?: boolean;
}

interface UseObjectSetQueryResult<T> {
  data: T[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useObjectSetQuery<T = Record<string, unknown>>(
  options: UseObjectSetQueryOptions,
): UseObjectSetQueryResult<T> {
  const { ontologyRid, objectType, filter, pageSize = 200, enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!ontologyRid || !objectType || !enabled) return;
    setLoading(true);
    setError(null);

    try {
      const objectSet = filter
        ? { type: "filter", objectSet: { type: "base", objectType }, where: filter }
        : { type: "base", objectType };

      const res = await fetch(
        `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectSet, pageSize }),
        },
      );

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const result = await res.json();
      const items = (result.data ?? []).map((o: { properties: T }) => o.properties);
      setData(items);
      setTotal(result.totalCount ?? items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [ontologyRid, objectType, filter, pageSize, enabled]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { data, total, loading, error, refetch: fetchData };
}

interface AggregationOptions {
  ontologyRid: string;
  objectType: string;
  aggregation: Array<{ type: string; property?: string }>;
  groupBy?: string;
  filter?: ObjectSetFilter;
  enabled?: boolean;
}

interface AggregationResult {
  data: Array<{ group?: string; value: number }>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAggregation(options: AggregationOptions): AggregationResult {
  const { ontologyRid, objectType, aggregation, groupBy, filter, enabled = true } = options;
  const [data, setData] = useState<Array<{ group?: string; value: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!ontologyRid || !objectType || !enabled) return;
    setLoading(true);
    setError(null);

    try {
      const objectSet = filter
        ? { type: "filter", objectSet: { type: "base", objectType }, where: filter }
        : { type: "base", objectType };

      const body: Record<string, unknown> = { objectSet, aggregation };
      if (groupBy) body.groupBy = [{ field: groupBy, type: "exact" }];

      const res = await fetch(
        `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const result = await res.json();
      const items = (result.data ?? []).map((d: Record<string, unknown>) => ({
        group: d.group as string | undefined,
        value: (d.value ?? d.metrics?.count ?? 0) as number,
      }));
      setData(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aggregation failed");
    } finally {
      setLoading(false);
    }
  }, [ontologyRid, objectType, aggregation, groupBy, filter, enabled]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
