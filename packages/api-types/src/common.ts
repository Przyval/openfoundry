/**
 * Shared types used across all OpenFoundry API services.
 * Derived from conjure/common-types.yml.
 */

/** Resource identifier in format ri.<service>.<instance>.<type>.<locator> */
export type Rid = string;

/** Opaque cursor for pagination */
export type PageToken = string;

export type DisplayName = string;

export type Description = string;

/** ISO 8601 datetime string */
export type Timestamp = string;

/** Dynamic property value (string, integer, double, boolean, datetime, etc.) */
export type PropertyValue = unknown;

/** Map of property API names to their values */
export type PropertyMap = Record<string, PropertyValue>;

export interface PageRequest {
  pageSize?: number;
  pageToken?: PageToken;
}

export interface OrderByClause {
  field: string;
  direction?: "ASC" | "DESC";
}

export interface ErrorResponse {
  errorCode: string;
  errorName: string;
  errorInstanceId: string;
  parameters?: Record<string, unknown>;
  statusCode: number;
}
