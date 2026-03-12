import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type {
  StoredWebhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookEvent,
} from "./webhook-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface WebhookRow {
  rid: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  status: string;
  created_at: string;
  updated_at: string;
  failure_count: number;
  last_delivery_at: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToWebhook(row: WebhookRow): StoredWebhook {
  return {
    rid: row.rid,
    name: row.name,
    url: row.url,
    secret: row.secret ?? undefined,
    events: (row.events ?? []) as WebhookEvent[],
    status: row.status as StoredWebhook["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failureCount: row.failure_count,
    lastDeliveryAt: row.last_delivery_at ?? undefined,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// PgWebhookStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed webhook store.
 */
export class PgWebhookStore {
  constructor(private pool: pg.Pool) {}

  async createWebhook(input: CreateWebhookInput): Promise<StoredWebhook> {
    const rid = generateRid("webhooks", "webhook").toString();

    try {
      const { rows } = await this.pool.query<WebhookRow>({
        text: `INSERT INTO webhooks (rid, name, url, secret, events, status, failure_count)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`,
        values: [
          rid,
          input.name,
          input.url,
          input.secret ?? null,
          input.events,
          "ACTIVE",
          0,
        ],
      });

      return rowToWebhook(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Webhook", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async getWebhook(rid: string): Promise<StoredWebhook> {
    const { rows } = await this.pool.query<WebhookRow>({
      text: `SELECT * FROM webhooks WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Webhook", rid);
    }
    return rowToWebhook(rows[0]);
  }

  async listWebhooks(): Promise<StoredWebhook[]> {
    const { rows } = await this.pool.query<WebhookRow>({
      text: `SELECT * FROM webhooks ORDER BY created_at ASC`,
    });

    return rows.map(rowToWebhook);
  }

  async updateWebhook(rid: string, input: UpdateWebhookInput): Promise<StoredWebhook> {
    // Verify it exists
    await this.getWebhook(rid);

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 0;

    if (input.name !== undefined) {
      idx++;
      sets.push(`name = $${idx}`);
      values.push(input.name);
    }
    if (input.url !== undefined) {
      idx++;
      sets.push(`url = $${idx}`);
      values.push(input.url);
    }
    if (input.secret !== undefined) {
      idx++;
      sets.push(`secret = $${idx}`);
      values.push(input.secret);
    }
    if (input.events !== undefined) {
      idx++;
      sets.push(`events = $${idx}`);
      values.push(input.events);
    }
    if (input.status !== undefined) {
      idx++;
      sets.push(`status = $${idx}`);
      values.push(input.status);
    }

    sets.push(`updated_at = NOW()`);

    idx++;
    values.push(rid);

    const { rows } = await this.pool.query<WebhookRow>({
      text: `UPDATE webhooks SET ${sets.join(", ")} WHERE rid = $${idx} RETURNING *`,
      values,
    });

    if (rows.length === 0) {
      throw notFound("Webhook", rid);
    }
    return rowToWebhook(rows[0]);
  }

  async deleteWebhook(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM webhooks WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Webhook", rid);
    }
  }

  async getWebhooksForEvent(event: WebhookEvent): Promise<StoredWebhook[]> {
    const { rows } = await this.pool.query<WebhookRow>({
      text: `SELECT * FROM webhooks
             WHERE status = 'ACTIVE' AND $1 = ANY(events)
             ORDER BY created_at ASC`,
      values: [event],
    });

    return rows.map(rowToWebhook);
  }

  async markDelivery(rid: string, success: boolean): Promise<void> {
    if (success) {
      await this.pool.query({
        text: `UPDATE webhooks
               SET last_delivery_at = NOW(), failure_count = 0, updated_at = NOW()
               WHERE rid = $1`,
        values: [rid],
      });
    } else {
      await this.pool.query({
        text: `UPDATE webhooks
               SET last_delivery_at = NOW(),
                   failure_count = failure_count + 1,
                   status = CASE WHEN failure_count + 1 >= 10 THEN 'FAILED' ELSE status END,
                   updated_at = NOW()
               WHERE rid = $1`,
        values: [rid],
      });
    }
  }
}
