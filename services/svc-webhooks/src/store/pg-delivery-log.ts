import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";
import type { WebhookDelivery } from "./delivery-log.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface DeliveryRow {
  rid: string;
  webhook_rid: string;
  event: string;
  payload: unknown;
  status: string;
  status_code: number | null;
  attempts: number;
  created_at: string;
  delivered_at: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToDelivery(row: DeliveryRow): WebhookDelivery {
  return {
    rid: row.rid,
    webhookRid: row.webhook_rid,
    event: row.event,
    payload: row.payload,
    status: row.status as WebhookDelivery["status"],
    statusCode: row.status_code ?? undefined,
    attempts: row.attempts,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// PgDeliveryLog
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed delivery log for webhook deliveries.
 */
export class PgDeliveryLog {
  constructor(private pool: pg.Pool) {}

  async logDelivery(
    webhookRid: string,
    event: string,
    payload: unknown,
  ): Promise<WebhookDelivery> {
    const rid = generateRid("webhooks", "delivery").toString();

    const { rows } = await this.pool.query<DeliveryRow>({
      text: `INSERT INTO webhook_deliveries (rid, webhook_rid, event, payload, status, attempts)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      values: [rid, webhookRid, event, JSON.stringify(payload), "PENDING", 0],
    });

    return rowToDelivery(rows[0]);
  }

  async getDelivery(rid: string): Promise<WebhookDelivery> {
    const { rows } = await this.pool.query<DeliveryRow>({
      text: `SELECT * FROM webhook_deliveries WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("WebhookDelivery", rid);
    }
    return rowToDelivery(rows[0]);
  }

  async listDeliveries(webhookRid?: string): Promise<WebhookDelivery[]> {
    if (webhookRid) {
      const { rows } = await this.pool.query<DeliveryRow>({
        text: `SELECT * FROM webhook_deliveries WHERE webhook_rid = $1 ORDER BY created_at ASC`,
        values: [webhookRid],
      });
      return rows.map(rowToDelivery);
    }

    const { rows } = await this.pool.query<DeliveryRow>({
      text: `SELECT * FROM webhook_deliveries ORDER BY created_at ASC`,
    });
    return rows.map(rowToDelivery);
  }

  async markDelivered(rid: string, statusCode: number): Promise<WebhookDelivery> {
    const { rows } = await this.pool.query<DeliveryRow>({
      text: `UPDATE webhook_deliveries
             SET status = $1, status_code = $2, attempts = attempts + 1, delivered_at = NOW()
             WHERE rid = $3
             RETURNING *`,
      values: ["DELIVERED", statusCode, rid],
    });

    if (rows.length === 0) {
      throw notFound("WebhookDelivery", rid);
    }
    return rowToDelivery(rows[0]);
  }

  async markFailed(rid: string, statusCode?: number): Promise<WebhookDelivery> {
    const { rows } = await this.pool.query<DeliveryRow>({
      text: `UPDATE webhook_deliveries
             SET status = $1, status_code = $2, attempts = attempts + 1
             WHERE rid = $3
             RETURNING *`,
      values: ["FAILED", statusCode ?? null, rid],
    });

    if (rows.length === 0) {
      throw notFound("WebhookDelivery", rid);
    }
    return rowToDelivery(rows[0]);
  }

  async incrementAttempts(rid: string): Promise<void> {
    await this.pool.query({
      text: `UPDATE webhook_deliveries SET attempts = attempts + 1 WHERE rid = $1`,
      values: [rid],
    });
  }
}
