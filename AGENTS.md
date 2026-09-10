# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build and test sharp edges

A clean `pnpm install --frozen-lockfile` does NOT build.
No workspace package declares `@types/node` and `tsconfig.base.json` sets no `types`, so `tsc` fails in `packages/config`, `packages/rid` and `packages/tracing` with `Cannot find module 'node:fs'` and `Cannot find name 'crypto'`.
Because turbo runs `build` as a dependency of the other tasks, `pnpm run build`, `typecheck`, `lint` and `test` all fail from this one cause.
This is pre-existing, not something a given branch introduced. Verify before assuming your change broke it.

CI has never executed on this repository.
Every workflow in `.github/workflows/` triggers on branch `main`, but the default branch is `master`, so no run is ever queued.
A green PR here therefore means "no checks ran", not "checks passed".

Integration tests are `pnpm run test:integration` (config in `tests/vitest.config.ts`).
8 of the 12 files start their own in-process server and pass with nothing else running.
The other 4 require a live gateway on `localhost:8080`; use `bash start.sh` (needs Docker Postgres) as `scripts/test-integration.sh` describes.

## Secrets

Real credentials live only in `.env`, which is gitignored; `.env.example` lists every key with empty values.
The Sanocare/Kelava sync scripts read their SSH tunnel addresses from `TUNNEL_DB_HOST` and `TUNNEL_JUMP_HOST`.
Those addresses are live infrastructure and must never be committed to this public repository.

## Demo seed scripts

The four industry demo seeds live in `scripts/demo/`, not `scripts/`.
Callers still reference the old `scripts/seed-*.sh` paths, which is a known unfinished migration; see `docker-entrypoint.sh`, `.github/workflows/test.yml` and `GUIDE.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
