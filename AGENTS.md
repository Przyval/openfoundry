# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build sharp edges

`pnpm run build` is green (49/49), as is `typecheck` (45/45). Keep it that way.
Run `npx turbo run build --continue` to see every failure at once; plain `build` stops at the first.

`pnpm run lint` is a real check now: it runs `eslint .` directly over all 598 `.ts`/`.tsx`/`.mts`
files in the repo, not `turbo run lint`. There is no per-package `lint` script and no per-package
eslint config on purpose - one root `eslint.config.mjs` means no package can silently opt out,
which is exactly how this task's predecessor reported 21/21 green while checking zero files.
It is green at 0 errors with 227 warnings outstanding (181 `no-explicit-any`, 35 `no-unused-vars`,
11 `react-hooks/exhaustive-deps`); only errors fail the run, so a growing warning count is
visible but unguarded.
`no-console` is off for `scripts/`, `services/` and `tests/`, plus three library modules whose
job is printing (`packages/logging/src/logger.ts`, `packages/redis/src/client.ts`,
`packages/sdk/sdk-cli/src/output.ts`). Scope the rule, never add per-line disables.
`eslint-plugin-react-hooks` is pinned to the two classic rules (`rules-of-hooks`,
`exhaustive-deps`). Its v7 `recommended` preset also enables the React Compiler rules
(`set-state-in-effect`, `refs`, `immutability`, `preserve-manual-memoization`), which flag 46
further errors in the console; adopting those is a deliberate decision, not a config default.
Prettier is unenforced - `pnpm run format` writes, nothing checks, and most files are
not Prettier-clean; do not reformat a file wholesale just because `prettier --check` flags it.

`noUnusedLocals` and `noUnusedParameters` are on, so an unused import or local is a hard error.
Prefix a deliberately unused parameter with `_`; that exemption does not apply to locals.

The console is on `@blueprintjs/*` v5. Do not copy v4 props from older code: `HTMLTable` uses `compact`, not `condensed`, and `Tag` has no small size at all, since v5 types it as `size?: NonSmallSize` = `Exclude<Size, "small">`. `Button` still accepts `small`.

`CryptoKey` is not a global here: `tsconfig.base.json` sets `lib: ["ES2022"]` with no DOM, and `@types/node` 20 declares `CryptoKey` only inside the `webcrypto` namespace. Import the type from `jose`, which exports its own and is what `generateKeyPair` returns.

Any package using Node builtins or Node globals must declare `@types/node` itself.
Nothing hoists it for you, and the failure looks like `Cannot find module 'node:fs'` or `Cannot find name 'Buffer' / 'console' / 'setInterval'`.
Because turbo runs `build` as a dependency of the other tasks, one such gap fails `build`, `typecheck`, `lint` and `test` together.

## Tests

`pnpm run test` (turbo `test`) is green (97/97).
A package running `vitest run` inherits the root `vitest.config.ts`, whose `include` globs are
resolved against the run's root - the package directory, not the repo root.
Keep those globs relative (`**/tests/**/*.test.ts`); a root-anchored `packages/**` glob matches
nothing per package and every package then dies on "No test files found".

Read that message carefully before acting on it: here it meant the glob missed, not that tests were absent.
47 of the 48 packages declaring a `test` script do contain test files; only `@openfoundry/app-workshop` has none.
Reaching for `--passWithNoTests` would have turned the job green while suppressing a monorepo of suites that were never running.

`apps/app-console` is the exception to that glob note: it has no `vitest.config.ts`, so its `vitest run`
resolves `apps/app-console/vite.config.ts`, which declares no `test` block, and vitest falls back to its
own default include globs rather than the root config's `**/tests/**` + `**/src/**`.

Integration tests are `pnpm run test:integration` (config in `tests/vitest.config.ts`).
Most files start their own in-process server; `api-endpoints` and `sdk-compat` need a real gateway on `localhost:8080` via `bash start.sh`, which needs Docker Postgres.
`api-endpoints` additionally needs *seeded* data: it reads the first existing ontology rather than creating one, so against an empty store its whole first test yields nothing and 20 tests cascade into "expected undefined to be defined".
Seed with any `scripts/demo/seed-*.sh` before blaming a change. With data seeded it is 36/37, the one failure being Actions apply returning 404 where the test expects 400; that failure predates this note.

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

`PgObjectStore` is fully async where `ObjectStore` is synchronous. Both satisfy `ObjectReadWriteStore`, whose methods return `T | Promise<T>`, and every route in `svc-objects/src/server.ts` is registered against that interface with no cast.
Await every store call in a handler: an unawaited read passes every in-memory test and serves a pending promise as a 200 against Postgres.

The declaration lookups (`PgObjectStore.propertyNames`, `linkTargetObjectType`) are scoped by `ontology_rid`, but `resolveObjectTypeRid` - which every data read goes through - is not.
Where two ontologies declare a same-named object type, the property-existence check and the rows served can therefore come from different declarations; see the note on `propertyNames`.
Scoping the store's type resolution is separate architecture work, not a patch.

There are no ontology branches, scenarios or ontology transactions - every `branch` in this repo is a *dataset* branch, and the console's Scenarios page persists nothing.
The v2 ontology endpoints therefore reject any `branch`, `scenarioRid` or `transactionId` value rather than serving the only state there is; `packages/errors/src/ontology-scoping.ts` is the single place that policy lives.

## Serving both API versions

`/api/v1` and `/api/v2` are different APIs, not one API behind two prefixes.
The models diverge exactly where a blind alias would hurt: v1 `Branch` is keyed `branchId` where v2 uses `name`, v1 `OntologyObject` nests values under `properties` while v2 is a bare property map, v1 `ObjectType.primaryKey` is a list, and v1 `ApplyActionResponse` declares no fields at all.
`File` is the counter-example that proves the rule: v1 and v2 declare the identical four fields (`path`, `transactionRid`, `sizeBytes`, `updatedTime`), and each version still projects it separately, because agreeing today is not a contract.
A field the store has but Foundry does not - `contentType` on a file - is as much a divergence as a missing one, so it is not emitted.
Each service keeps its v1 wire shapes in `services/*/src/routes/v1/serializers.ts`, projected from the store rather than from whatever the neighbouring v2 route happens to emit, and `services/svc-objects/src/routes/v1/search-query.ts` does the same for the v1 filter grammar - whose `contains` tests array membership where the shared query engine's tests a substring.
Check `foundry_sdk/v1/*/models.py` and `foundry_sdk/v2/*/models.py` in the official Python SDK before adding to either version.
Operations left unserved are recorded where they would have gone; `services/svc-datasets/src/routes/v1/files.ts` is the worked example.

Fastify hands a plugin the options object it was registered with, `prefix` included.
Passing that object straight on to a child `app.register` applies the prefix a second time, so the routes land under `/api/v1/api/v1/...` and every request 404s - build a fresh options object for each child.
No static route scan can see this, so confirm a new route is really reachable with `app.printRoutes()` or an `app.inject` test rather than trusting an inventory of the source.

## Authentication and caller identity

Fastify encapsulates anything passed to `app.register`, so a plugin that adds an `onRequest` hook there guards only routes registered inside that child context.
`authPlugin` and `rateLimitPlugin` are therefore called directly on the root instance in `services/svc-gateway/src/server.ts`; registering either one silently guards nothing.

The gateway enforces only when `AUTH_PUBLIC_KEY` is set; empty means every request passes, which is the demo default.
The key must be the PEM that matches svc-multipass's `JWT_PRIVATE_KEY`, and `AUTH_ISSUER` must match the `iss` multipass signs (`openfoundry-multipass`) or every real token is rejected.

Every non-browser caller gets its bearer token from the environment through `scripts/lib/auth.sh` (`of_curl`) or `scripts/lib/auth.ts` (`authHeaders`): `OPENFOUNDRY_TOKEN`, or `OPENFOUNDRY_CLIENT_ID`/`OPENFOUNDRY_CLIENT_SECRET` exchanged for one.
Both send no header when neither is set, so the demo still works unauthenticated. Never write a credential into a script - this repository is public.
The console covers its ~80 `fetch` call sites with one interceptor, `apps/app-console/src/lib/authFetch.ts`, installed from `main.tsx`.

Downstream services read identity from `X-User-Id` / `X-User-Roles` (`packages/permissions/src/middleware.ts`).
`services/svc-gateway/src/proxy.ts` always drops those headers on the way in and re-asserts them from the verified claims, so a client cannot pick its own roles.
It sets both or neither: the permission middleware denies a request carrying a user id without roles, so a half-filled identity 403s every downstream route.
Roles travel in an optional `roles` claim minted by svc-multipass; a token without it conveys no roles and downstream decides as it did before.

The proxy must not forward the incoming `Content-Length`: the body is re-serialised from Fastify's parsed form, and a stale length makes undici reject the request, which surfaces as a 502.

## Running the console end to end

`bash start.sh` boots ten services plus the console on :3000, but it first kills whatever holds ports 8080-8088, 8092 and 3000 - check those are yours before running it.
It never checks :8091, where svc-sentinel actually listens.
Three services are absent from its list entirely - svc-compass, svc-webhooks and svc-media - so `/api/v2/compass/*`, `/api/v2/webhooks*` and `/api/v2/media*` answer 502 and their console pages never load until you start them yourself.

The four seeds in `scripts/demo/` reuse the *first existing* ontology rather than creating their own, and none of them reads `ORG_RID` (only the unused `scripts/seed-common.sh` does).
Running a second one therefore merges another industry's object types into the first ontology instead of switching industries; `start.sh --industry <name>` is the only correct switch, because it clears the three store JSONs first.

Without `DATABASE_URL` every service uses its in-memory or `/tmp/openfoundry-data` store; that is the mode the demo is built for, and the only mode in which svc-admin's user and group routes work.
`/tmp/openfoundry-data` is a fixed path with no env override, so two checkouts running at once share and overwrite it.

Dev login is `admin` / `admin123` (see `DEV_USERS` in `services/svc-multipass/src/routes/auth.ts`); the `admin` / `admin123` and `developer` / `dev123` pairs also work as OAuth client credentials.

## Identity and permissions

Two different `requirePermission` exports coexist and only one is reachable.
`services/svc-gateway/src/middleware/rbac.ts` has zero importers repo-wide; the one that actually guards 118 routes is `@openfoundry/permissions`, whose header-based variant reads `x-user-id` / `x-user-roles`.
Those headers are a trusted-hop input, never a client input: the gateway proxy drops every `x-user-*` header so a caller cannot assert its own roles. Do not re-add them to the forwarded set, and do not introduce a second identity header without a hop that sets it from a verified token.
Seed and sync scripts talk to the service ports directly, not through the gateway, so that strip does not reach them - which is also why a service port must never be publicly reachable.
Role enforcement is still absent after that strip: what it removed was a role claim any caller could forge, not working enforcement, and nothing yet sets those headers from a verified token.
Until a trusted hop does, `ENFORCE_PERMISSIONS=true` makes every gateway-proxied route answer 403, because the permission hook sees neither `x-user-id` nor `request.claims`.

`request.claims` is never populated: `authPlugin` is registered unencapsulated at `services/svc-gateway/src/server.ts:153` without `fastify-plugin`, so its `onRequest` hook applies to nothing.
Until that is fixed, no token-based permission check enforces anything. `claims.sub` is also a username, not a RID (`svc-multipass/src/routes/auth.ts:122`), and issued tokens carry no `roles` claim at all (`packages/auth-tokens/src/token-creator.ts`).

Neither model is Foundry's, so do not converge on either as-is.
Foundry grants *roles on a resource* - `POST /v2/filesystem/resources/{resourceRid}/roles/add`, inherited by the container's contents, with principals that may be groups - while roles themselves are platform-defined and read-only over the API (`GET /v2/admin/roles/{roleId}` and `getBatch` only, no create or delete).
Against that, `@openfoundry/permissions` roles are global (an EDITOR may write every ontology in the deployment) and `rbac.ts` is a bare `(subject, resource, permission)` ACL with no role, container, group or owner.
`createPgStoreHook` in `packages/permissions/src/middleware.ts` is the one piece already shaped right: admin bypass, then resource grant, then role fallback.
Tenant isolation is a separate, *mandatory* layer in Foundry (Organizations) and is `org_rid` + RLS here - no permission check delivers it, and none should be described as doing so.

## Front-end to service sharp edges

The console must not send `Content-Type: application/json` on a request with no body: Fastify rejects it with `FST_ERR_CTP_EMPTY_JSON_BODY`, which the gateway reports as a 500.
Several pages still pair a bodyless `fetch` with that header.

Services serialize identifiers as `rid` while the console reads Foundry's `id`.
`svc-admin` emits both for groups, but the mismatch is unfixed elsewhere, and a page whose row key is `undefined` fails silently rather than erroring.

Setting `DATABASE_URL` swaps svc-admin onto `PgUserStore` / `PgGroupStore`, whose methods are async.
Every user route, plus the group routes that create, read, list, delete a group and add or remove a single member (`groups.ts` `/admin/groups*` and `/admin/groups/:groupRid/members*` except the member list), still calls them synchronously and so 500s in that mode.
The audit route, `GET /admin/groups/:groupRid/members` and all three `groupMembers` routes await their store calls and work in both modes.

`app.css` declares `@layer blueprint, app`, but `main.tsx` imports Blueprint's stylesheets unlayered, and unlayered rules beat every layer no matter how specific the selector.
A rule that has to override Blueprint therefore has to sit outside `@layer app`; the navbar override at the end of `app.css` is the worked example.

`scripts/migrate.sql` (what Docker Compose loads at init) and `db/migrations/*.sql` (what `pnpm db:migrate` applies) have drifted: only the latter adds `org_rid` and row-level security.
Code written against one schema fails against the other - `PgObjectStore` inserts `org_rid`, which the Compose database has no column for.
A Pg store can also name a column no schema has at all and nothing catches it: `PgFileStore.putFile` set `updated_at` for months against a `dataset_files` table without that column, so every overwrite failed with `42703` while the in-memory suite stayed green.
`services/svc-datasets/tests/pg-file-write-time.test.ts` is the pattern for guarding that - assert the SQL, then assert both schema sources carry what it names.

## Secrets

Real credentials live only in `.env`, which is gitignored; `.env.example` lists every key with empty values.
The Sanocare/Kelava sync scripts read their SSH tunnel addresses from `TUNNEL_DB_HOST` and `TUNNEL_JUMP_HOST`.
Those addresses are live infrastructure and must never be committed to this public repository.

## CI

Workflows trigger on `master`, the default branch. They previously listened on `main`, which has never existed here, so nothing ever ran.
`docker.yml` publishes 12 images to ghcr.io on push to `master` and on `v*` tags, and also accepts `workflow_dispatch`, so image-build changes can be proven on a branch instead of only after a merge.
Build the tag from a lowercased `GITHUB_REPOSITORY`, never from `github.repository` directly: the owner login is `Przyval`, and ghcr.io rejects any uppercase letter in a repository name.
`Dockerfile.service` selects turbo packages by package name (`@openfoundry/${SERVICE}`), not by the `services/` directory name; the other `${SERVICE}` uses in that file are filesystem paths and stay bare.
`release.yml` publishes nothing: the repo has no Actions secrets at all, so `NPM_TOKEN` is empty and `changeset publish` fails with ENEEDAUTH on every push.

## The user guide

`GUIDE.md` is the product's user guide, written in Indonesian and verified end to end against a running stack rather than from the code alone.
Its closing "Batasan yang Diketahui" section is the current inventory of what is verified *not* to work (gateway auth not enforced, Network Graph edges, `/api/v2/search` without Postgres, Compass offline fallback, the `complete-service-job` invoice-id collision, the `VITE_API_URL` vs `VITE_API_BASE_URL` mismatch, and more).
Read it before re-deriving any of that, and update it in the same change whenever one of those is fixed.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
