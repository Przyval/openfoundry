// ---------------------------------------------------------------------------
// Aggregation types — 8 aggregation operations
// ---------------------------------------------------------------------------

export type AggregationType =
  | "COUNT"
  | "MIN"
  | "MAX"
  | "SUM"
  | "AVG"
  | "APPROXIMATE_DISTINCT"
  | "EXACT_DISTINCT"
  | "APPROXIMATE_PERCENTILE";

export interface CountAggregation {
  type: "COUNT";
}

export interface MinAggregation {
  type: "MIN";
  property: string;
}

export interface MaxAggregation {
  type: "MAX";
  property: string;
}

export interface SumAggregation {
  type: "SUM";
  property: string;
}

export interface AvgAggregation {
  type: "AVG";
  property: string;
}

export interface ApproximateDistinctAggregation {
  type: "APPROXIMATE_DISTINCT";
  property: string;
}

export interface ExactDistinctAggregation {
  type: "EXACT_DISTINCT";
  property: string;
}

export interface ApproximatePercentileAggregation {
  type: "APPROXIMATE_PERCENTILE";
  property: string;
  percentile: number;
}

/**
 * Discriminated union of all 8 aggregation types.
 */
export type Aggregation =
  | CountAggregation
  | MinAggregation
  | MaxAggregation
  | SumAggregation
  | AvgAggregation
  | ApproximateDistinctAggregation
  | ExactDistinctAggregation
  | ApproximatePercentileAggregation;

// ---------------------------------------------------------------------------
// Aggregation factory functions
// ---------------------------------------------------------------------------

export function count(): CountAggregation {
  return { type: "COUNT" };
}

export function min(property: string): MinAggregation {
  return { type: "MIN", property };
}

export function max(property: string): MaxAggregation {
  return { type: "MAX", property };
}

export function sum(property: string): SumAggregation {
  return { type: "SUM", property };
}

export function avg(property: string): AvgAggregation {
  return { type: "AVG", property };
}

export function approximateDistinct(property: string): ApproximateDistinctAggregation {
  return { type: "APPROXIMATE_DISTINCT", property };
}

export function exactDistinct(property: string): ExactDistinctAggregation {
  return { type: "EXACT_DISTINCT", property };
}

export function approximatePercentile(property: string, percentile: number): ApproximatePercentileAggregation {
  if (percentile < 0 || percentile > 1) {
    throw new RangeError("Percentile must be between 0 and 1");
  }
  return { type: "APPROXIMATE_PERCENTILE", property, percentile };
}
