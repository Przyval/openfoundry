# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build sharp edges

`pnpm run build` still fails, and it is not your change.
Roughly 40 pre-existing type errors remain across 7 packages, in two clusters.
Blueprint v4 table and tag props (`condensed`, `striped`, `bordered`, `minimal` on `Tag`) are checked against v5 types, and `CryptoKey` is missing because `tsconfig.base.json` sets `lib: ["ES2022"]` with no DOM.
`noUnusedLocals` and `noUnusedParameters` are on, so unused imports are hard errors too.
Run `npx turbo run build --continue` to see every failure at once; plain `build` stops at the first.

Any package using Node builtins or Node globals must declare `@types/node` itself.
Nothing hoists it for you, and the failure looks like `Cannot find module 'node:fs'` or `Cannot find name 'Buffer' / 'console' / 'setInterval'`.
Because turbo runs `build` as a dependency of the other tasks, one such gap fails `build`, `typecheck`, `lint` and `test` together.

## Tests

Integration tests are `pnpm run test:integration` (config in `tests/vitest.config.ts`).
Most files start their own in-process server; `api-endpoints` and `sdk-compat` need a real gateway on `localhost:8080` via `bash start.sh`, which needs Docker Postgres.

The suite is NOT idempotent. It writes to `/tmp/openfoundry-data/` and a second run fails with 409s on already-created ontologies.
Run `rm -rf /tmp/openfoundry-data` before re-running, or you will chase failures that are only leftover state.

## Secrets

Real credentials live only in `.env`, which is gitignored; `.env.example` lists every key with empty values.
The Sanocare/Kelava sync scripts read their SSH tunnel addresses from `TUNNEL_DB_HOST` and `TUNNEL_JUMP_HOST`.
Those addresses are live infrastructure and must never be committed to this public repository.

## CI

Workflows trigger on `master`, the default branch. They previously listened on `main`, which has never existed here, so nothing ever ran.
Note that `docker.yml` and `release.yml` fire on push only and do publish: 12 images to ghcr.io and a changesets npm release.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
