import type pg from "pg";
import { notFound } from "@openfoundry/errors";
import type { StoredFile } from "./file-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface FileRow {
  dataset_rid: string;
  path: string;
  size: number;
  content_type: string;
  transaction_rid: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// PgFileStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed file metadata store.
 *
 * File metadata (path, size, content type, transaction) is persisted in PG.
 * Actual file content remains in-memory for now -- the `content` field on
 * StoredFile is populated from a local cache.  A future iteration will move
 * content to object storage (S3 / GCS).
 */
export class PgFileStore {
  /** In-memory cache for file content, keyed by `${datasetRid}::${path}`. */
  private readonly contentCache = new Map<string, Uint8Array>();

  constructor(private pool: pg.Pool) {}

  private cacheKey(datasetRid: string, path: string): string {
    return `${datasetRid}::${path}`;
  }

  async putFile(
    datasetRid: string,
    path: string,
    content: Uint8Array,
    contentType: string,
    transactionRid: string,
  ): Promise<StoredFile> {
    const size = content.byteLength;

    await this.pool.query({
      text: `INSERT INTO dataset_files (dataset_rid, path, size, content_type, transaction_rid)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (dataset_rid, path) DO UPDATE SET
               size = EXCLUDED.size,
               content_type = EXCLUDED.content_type,
               transaction_rid = EXCLUDED.transaction_rid,
               updated_at = NOW()`,
      values: [datasetRid, path, size, contentType, transactionRid],
    });

    this.contentCache.set(this.cacheKey(datasetRid, path), content);

    return { path, size, contentType, content, transactionRid };
  }

  async getFile(datasetRid: string, path: string): Promise<StoredFile> {
    const { rows } = await this.pool.query<FileRow>({
      text: `SELECT * FROM dataset_files WHERE dataset_rid = $1 AND path = $2`,
      values: [datasetRid, path],
    });

    if (rows.length === 0) {
      throw notFound("File", path);
    }

    const row = rows[0];
    const content = this.contentCache.get(this.cacheKey(datasetRid, path)) ?? new Uint8Array(0);

    return {
      path: row.path,
      size: row.size,
      contentType: row.content_type,
      content,
      transactionRid: row.transaction_rid,
    };
  }

  async listFiles(datasetRid: string): Promise<StoredFile[]> {
    const { rows } = await this.pool.query<FileRow>({
      text: `SELECT * FROM dataset_files WHERE dataset_rid = $1 ORDER BY path ASC`,
      values: [datasetRid],
    });

    return rows.map((row) => ({
      path: row.path,
      size: row.size,
      contentType: row.content_type,
      content: this.contentCache.get(this.cacheKey(datasetRid, row.path)) ?? new Uint8Array(0),
      transactionRid: row.transaction_rid,
    }));
  }

  async deleteFile(datasetRid: string, path: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM dataset_files WHERE dataset_rid = $1 AND path = $2`,
      values: [datasetRid, path],
    });

    if (result.rowCount === 0) {
      throw notFound("File", path);
    }

    this.contentCache.delete(this.cacheKey(datasetRid, path));
  }
}
