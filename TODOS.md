# TODOS

Tracked items from eng review (2026-03-26). Each TODO has context so someone picking it up in 3 months understands the motivation.

---

## Phase 1

### Signup transaction rollback
**What:** Wrap org creation + industry seed in a single DB transaction with rollback on failure.
**Why:** If the seed script fails mid-way, an orphaned organization exists with no data — the user sees an empty dashboard with no recovery path. Partial state is worse than failure.
**Depends on:** Phase 1 signup implementation. Seed scripts must be converted from bash/curl to TypeScript to participate in a Postgres transaction.
**Files:** `services/svc-multipass/src/routes/auth.ts` (signup endpoint), `scripts/seed-*.sh` (convert to TS)

### OSDK SDK 4 compatibility fixes
**What:** Fix 4 known @osdk/foundry SDK compatibility gaps:
1. `GET /api/v2/ontologies/{apiName}` — accept apiName, not just RID
2. `GET /api/v2/ontologies/{id}/queryTypes` — stub or implement route
3. `POST /api/v2/datasets/{rid}/transactions` — accept `transactionType` field (SDK sends this, server expects `type`)
4. `POST .../objects/{type}/search` with `where:{}` — handle empty where clause without crashing
**Why:** Core value prop is Palantir SDK compatibility. 500 errors on standard SDK calls break customer trust.
**Depends on:** Nothing — can be fixed independently.
**Files:** `services/svc-ontology/src/routes/`, `services/svc-objects/src/routes/`, `services/svc-datasets/src/routes/`

---

## Phase 2

### Daily Postgres backup
**What:** Automated daily pg_dump to S3-compatible object storage (MinIO endpoint already in .env.example).
**Why:** Customer data loss is a business-ending event. With paying customers' operational data, a backup strategy is non-negotiable.
**Depends on:** S3/MinIO credentials configured. VPS cron or pg_cron.
**Files:** New `scripts/backup.sh`, cron entry in Docker or systemd
