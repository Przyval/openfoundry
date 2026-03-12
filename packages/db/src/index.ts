// Pool management
export {
  type DatabaseConfig,
  createPool,
  closePool,
  withTransaction,
} from "./pool.js";

// Query builder
export { QueryBuilder, sql, type QueryConfig } from "./query-builder.js";

// Migration runner
export { runMigrations } from "./migrator.js";

// Helpers
export {
  toPgTimestamp,
  fromPgTimestamp,
  jsonbSet,
  paginate,
} from "./helpers.js";

// Audit
export { AuditLogger, type AuditEntry } from "./audit-logger.js";
export { auditHook } from "./audit-hook.js";
