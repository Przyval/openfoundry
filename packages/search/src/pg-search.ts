import type pg from "pg";
import type {
  SearchEngine,
  SearchQuery,
  SearchResponse,
  IndexableEntity,
} from "./types.js";

// ---------------------------------------------------------------------------
// Default limits
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Source table definitions for reindexing
// ---------------------------------------------------------------------------

interface SourceTableDef {
  entityType: string;
  table: string;
  ridCol: string;
  titleExpr: string;
  descriptionExpr: string;
  contentExpr: string;
}

const SOURCE_TABLES: SourceTableDef[] = [
  {
    entityType: "ONTOLOGY",
    table: "ontologies",
    ridCol: "rid",
    titleExpr: "COALESCE(display_name, api_name)",
    descriptionExpr: "description",
    contentExpr: "api_name",
  },
  {
    entityType: "OBJECT_TYPE",
    table: "object_types",
    ridCol: "rid",
    titleExpr: "COALESCE(display_name, api_name)",
    descriptionExpr: "description",
    contentExpr: "api_name",
  },
  {
    entityType: "DATASET",
    table: "datasets",
    ridCol: "rid",
    titleExpr: "COALESCE(name, rid)",
    descriptionExpr: "''",
    contentExpr: "COALESCE(name, '')",
  },
  {
    entityType: "RESOURCE",
    table: "compass_resources",
    ridCol: "rid",
    titleExpr: "name",
    descriptionExpr: "COALESCE(description, '')",
    contentExpr: "path",
  },
  {
    entityType: "FUNCTION",
    table: "functions",
    ridCol: "rid",
    titleExpr: "COALESCE(display_name, api_name)",
    descriptionExpr: "COALESCE(description, '')",
    contentExpr: "api_name",
  },
  {
    entityType: "ACTION",
    table: "action_registrations",
    ridCol: "rid",
    titleExpr: "COALESCE(display_name, api_name)",
    descriptionExpr: "''",
    contentExpr: "api_name",
  },
  {
    entityType: "USER",
    table: "users",
    ridCol: "rid",
    titleExpr: "COALESCE(display_name, username)",
    descriptionExpr: "COALESCE(email, '')",
    contentExpr: "username",
  },
  {
    entityType: "GROUP",
    table: "groups",
    ridCol: "rid",
    titleExpr: "name",
    descriptionExpr: "COALESCE(description, '')",
    contentExpr: "name",
  },
];

// ---------------------------------------------------------------------------
// PgSearchEngine
// ---------------------------------------------------------------------------

/**
 * PostgreSQL full-text search engine backed by a unified `search_index` table
 * with tsvector / tsquery.
 */
export class PgSearchEngine implements SearchEngine {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  async search(query: SearchQuery): Promise<SearchResponse> {
    const start = Date.now();

    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(query.offset ?? 0, 0);

    // Normalise the raw query into a tsquery-safe string.  We use
    // plainto_tsquery which handles punctuation and multi-word queries
    // without requiring the caller to know tsquery syntax.
    const tsquerySql = "plainto_tsquery('english', $1)";

    const conditions: string[] = [`search_vector @@ ${tsquerySql}`];
    const params: unknown[] = [query.query];

    if (query.entityTypes && query.entityTypes.length > 0) {
      params.push(query.entityTypes);
      conditions.push(`entity_type = ANY($${params.length})`);
    }

    const whereClause = conditions.join(" AND ");

    // Count query
    const countSql = `SELECT COUNT(*)::int AS total FROM search_index WHERE ${whereClause}`;

    // Data query with ranking and headline
    const dataSql = `
      SELECT
        rid,
        entity_type AS "entityType",
        title,
        description,
        ts_headline('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(content, ''),
                    ${tsquerySql},
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS highlight,
        ts_rank(search_vector, ${tsquerySql}) AS score,
        metadata
      FROM search_index
      WHERE ${whereClause}
      ORDER BY score DESC, title ASC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const dataParams = [...params, limit, offset];

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countSql, params),
      this.pool.query(dataSql, dataParams),
    ]);

    const totalCount: number = countResult.rows[0]?.total ?? 0;

    const results = dataResult.rows.map((row) => ({
      rid: row.rid as string,
      entityType: row.entityType as string,
      title: row.title as string,
      description: (row.description as string) || undefined,
      highlight: (row.highlight as string) || undefined,
      score: parseFloat(row.score as string),
      metadata: (row.metadata as Record<string, unknown>) || undefined,
    }));

    return {
      results: results as SearchResponse["results"],
      totalCount,
      query: query.query,
      durationMs: Date.now() - start,
    };
  }

  // -----------------------------------------------------------------------
  // indexEntity
  // -----------------------------------------------------------------------

  async indexEntity(entity: IndexableEntity): Promise<void> {
    const sql = `
      INSERT INTO search_index (rid, entity_type, title, description, content, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (rid) DO UPDATE SET
        entity_type = EXCLUDED.entity_type,
        title       = EXCLUDED.title,
        description = EXCLUDED.description,
        content     = EXCLUDED.content,
        metadata    = EXCLUDED.metadata,
        indexed_at  = NOW()
    `;

    await this.pool.query(sql, [
      entity.rid,
      entity.entityType,
      entity.title,
      entity.description ?? null,
      entity.content ?? null,
      JSON.stringify(entity.metadata ?? {}),
    ]);
  }

  // -----------------------------------------------------------------------
  // removeEntity
  // -----------------------------------------------------------------------

  async removeEntity(rid: string): Promise<void> {
    await this.pool.query("DELETE FROM search_index WHERE rid = $1", [rid]);
  }

  // -----------------------------------------------------------------------
  // reindexAll
  // -----------------------------------------------------------------------

  async reindexAll(): Promise<{ indexed: number }> {
    // Truncate the index and rebuild from all source tables.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE search_index");

      let totalIndexed = 0;

      for (const src of SOURCE_TABLES) {
        const sql = `
          INSERT INTO search_index (rid, entity_type, title, description, content)
          SELECT
            ${src.ridCol},
            '${src.entityType}',
            ${src.titleExpr},
            ${src.descriptionExpr},
            ${src.contentExpr}
          FROM ${src.table}
          ON CONFLICT (rid) DO NOTHING
        `;

        const result = await client.query(sql);
        totalIndexed += result.rowCount ?? 0;
      }

      await client.query("COMMIT");
      return { indexed: totalIndexed };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
