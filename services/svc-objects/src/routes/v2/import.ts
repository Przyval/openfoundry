/**
 * CSV Import Route — batch import objects from CSV content.
 *
 * POST /ontologies/:ontologyRid/import/csv
 * Content-Type: application/json
 *
 * Body:
 *   csvContent       - Raw CSV string
 *   objectType       - Target object type API name
 *   columnMapping    - { "csvColumn": "propertyName", ... }
 *   primaryKeyColumn - CSV column to use as primaryKey
 */

import type { FastifyInstance } from "fastify";

interface ImportRouteOptions {
  objectStore: {
    upsertObject(objectType: string, primaryKey: string, properties: Record<string, unknown>): unknown;
  };
}

interface ImportResult {
  imported: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

interface ImportBody {
  csvContent: string;
  objectType: string;
  columnMapping?: Record<string, string>;
  primaryKeyColumn: string;
}

/**
 * Minimal CSV parser — handles quoted fields, commas in values, and CRLF.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(field.trim());
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
        field = "";
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  // Last row
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);

  return rows;
}

export async function importRoutes(
  app: FastifyInstance,
  opts: ImportRouteOptions,
): Promise<void> {
  const { objectStore } = opts;

  app.post<{ Params: { ontologyRid: string }; Body: ImportBody }>(
    "/ontologies/:ontologyRid/import/csv",
    async (request, reply) => {
      const { csvContent, objectType, primaryKeyColumn } = request.body;
      const columnMapping = request.body.columnMapping ?? {};

      if (!csvContent || !objectType || !primaryKeyColumn) {
        return reply.status(400).send({
          error: "Missing required fields: csvContent, objectType, primaryKeyColumn",
        });
      }

      const rows = parseCSV(csvContent);
      if (rows.length < 2) {
        return reply.status(400).send({ error: "CSV must have at least a header row and one data row" });
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);
      const pkIdx = headers.indexOf(primaryKeyColumn);

      if (pkIdx === -1) {
        return reply.status(400).send({
          error: `Primary key column "${primaryKeyColumn}" not found in CSV headers: ${headers.join(", ")}`,
        });
      }

      // If no column mapping provided, use headers as-is
      if (Object.keys(columnMapping).length === 0) {
        for (const h of headers) {
          columnMapping[h] = h;
        }
      }

      const result: ImportResult = { imported: 0, failed: 0, errors: [] };

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const pk = row[pkIdx];
        if (!pk) {
          result.failed++;
          result.errors.push({ row: i + 2, message: "Empty primary key" });
          continue;
        }

        try {
          const properties: Record<string, unknown> = {};
          for (let j = 0; j < headers.length; j++) {
            const csvCol = headers[j];
            const propName = columnMapping[csvCol];
            if (propName && j < row.length) {
              const val = row[j];
              // Auto-detect numeric values
              const num = Number(val);
              properties[propName] = val !== "" && !isNaN(num) && val === String(num) ? num : val;
            }
          }

          await objectStore.upsertObject(objectType, pk, properties);
          result.imported++;
        } catch (err) {
          result.failed++;
          result.errors.push({
            row: i + 2,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return reply.status(200).send(result);
    },
  );
}
