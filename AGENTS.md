# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build sharp edges

`pnpm run build` is green (49/49), as is `typecheck` (45/45). Keep it that way.
Run `npx turbo run build --continue` to see every failure at once; plain `build` stops at the first.

`pnpm run lint` reports 21/21 but checks nothing: no package declares a `lint` script, so every
turbo `lint` task is a no-op, and `eslint` itself is not even installed (only `typescript-eslint`
and the root `eslint.config.js` exist). Treat a green lint run as no signal.
Prettier is likewise unenforced - `pnpm run format` writes, nothing checks, and most files are
not Prettier-clean; do not reformat a file wholesale just because `prettier --check` flags it.

`noUnusedLocals` and `noUnusedParameters` are on, so an unused import or local is a hard error.
Prefix a deliberately unused parameter with `_`; that exemption does not apply to locals.

The console is on `@blueprintjs/*` v5. Do not copy v4 props from older code: `HTMLTable` uses `compact`, not `condensed`, and `Tag` has no small size at all, since v5 types it as `size?: NonSmallSize` = `Exclude<Size, "small">`. `Button` still accepts `small`.

`CryptoKey` is not a global here: `tsconfig.base.json` sets `lib: ["ES2022"]` with no DOM, and `@types/node` 20 declares `CryptoKey` only inside the `webcrypto` namespace. Import the type from `jose`, which exports its own and is what `generateKeyPair` returns.

Any package using Node builtins or Node globals must declare `@types/node` itself.
Nothing hoists it for you, and the failure looks like `Cannot find module 'node:fs'` or `Cannot find name 'Buffer' / 'console' / 'setInterval'`.
Because turbo runs `build` as a dependency of the other tasks, one such gap fails `build`, `typecheck`, `lint` and `test` together.

## Tests

`pnpm run test` (turbo `test`) is green (96/96).
A package running `vitest run` inherits the root `vitest.config.ts`, whose `include` globs are
resolved against the run's root - the package directory, not the repo root.
Keep those globs relative (`**/tests/**/*.test.ts`); a root-anchored `packages/**` glob matches
nothing per package and every package then dies on "No test files found".

Read that message carefully before acting on it: here it meant the glob missed, not that tests were absent.
46 of the 47 packages declaring a `test` script do contain test files; only `@openfoundry/app-workshop` has none.
Reaching for `--passWithNoTests` would have turned the job green while suppressing a monorepo of suites that were never running.

Integration tests are `pnpm run test:integration` (config in `tests/vitest.config.ts`).
Most files start their own in-process server; `api-endpoints` and `sdk-compat` need a real gateway on `localhost:8080` via `bash start.sh`, which needs Docker Postgres.

Suites that start their own server pass `new OntologyStore(null)` / `new ObjectStore(null)` so they
stay off the shared file store; a store built with the default path loads `/tmp/openfoundry-data/`,
which the running services and every earlier run also write to.
The suite is still NOT idempotent against a live gateway: a second run fails with 409s on
already-created ontologies and with counts inflated by the previous run's objects.
Run `rm -rf /tmp/openfoundry-data` before re-running, or you will chase failures that are only leftover state.

## Store sharp edges

Never order or bound anything by a store's `createdAt`.
Those are millisecond ISO strings and collide freely - three transactions opened in one request, or an object created right after a page was served, all share a timestamp.
Order by position instead: the in-memory stores are `Map`s and arrays in insertion order, so an index is exact where a timestamp is ambiguous.

`PgObjectStore` implements only the CRUD subset of `ObjectStore` - it has no `allObjects`, and `svc-objects/src/server.ts` casts it with `store as ObjectStore`.
Anything reached through `allObjects` (object search, object-set load and aggregate) therefore throws against a Postgres-backed deployment while passing every in-memory test.

There are no ontology branches, scenarios or ontology transactions - every `branch` in this repo is a *dataset* branch, and the console's Scenarios page persists nothing.
The v2 ontology endpoints therefore reject any `branch`, `scenarioRid` or `transactionId` value rather than serving the only state there is; `packages/errors/src/ontology-scoping.ts` is the single place that policy lives.

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
