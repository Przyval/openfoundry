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

`pnpm run test` (turbo `test`) FAILS, and not because any assertion fails.
44 packages declare `test: vitest run` but ship no test files, and vitest exits 1 on "No test files found".
The CI `test` job runs exactly that, so it is red for this reason alone; `--passWithNoTests` is the one-line remedy if the project wants it.
Check for real failures with `grep -E "Test Files|AssertionError"` rather than trusting the exit code.

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
