# Foundry fidelity: the permission model

This records which parts of Foundry's security model OpenFoundry implements, where each part lives, and where it deliberately differs.
The sources are Palantir's own, kept outside this repository.
Cite them by the names below.

## Sources

- **S1** - Foundry security documentation, as captured in `Web-Grabber/palantir/PALANTIR_SECURITY_CONNECTORS_DOCS.md`.
  Section 1 (Security Overview), section 2 (Markings), section 3 (Projects, Roles & Permissions).
  Original pages: `/docs/foundry/security/overview/`, `/security/markings/`, `/security/projects-and-roles/`.
- **S2** - the official Python SDK, `foundry-platform-python`: `docs/v2/Core/models/RoleId.md` (default roles Owner, Editor, Viewer, Discoverer) and the `filesystem` resource-role operations (`POST /v2/filesystem/resources/{resourceRid}/roles/add`).
- **S3** - the same SDK's `admin` section: `GET /v2/admin/roles/{roleId}` and `getBatch`, with no create or delete.

## What Foundry says, and what we do about it

| Foundry (source) | Here |
| --- | --- |
| Two kinds of control. Mandatory controls (Organizations, Markings) restrict; discretionary controls (roles) grant. Mandatory ones "will always prevent an ineligible user from accessing a resource, regardless of the user's role". (S1 s1, s3) | `evaluate` in `packages/permissions/src/authorizer.ts` checks Organization, then Markings, then roles. A platform administrator is not exempt from the first two. |
| Roles are granted on a resource and inherited by what it contains. (S1 s3, S2) | A `RoleGrant` names a resource, a principal and a role. The route says which resource it is about, and the platform root last; a grant on any of them counts. `defaultResourceChain` in `middleware.ts`. |
| Default roles Owner > Editor > Viewer > Discoverer. (S1 s3, S2) | `packages/permissions/src/roles.ts`. Each operation names the lowest role that may perform it (`OPERATION_ROLES`). |
| Roles are platform-defined and read-only over the API. (S3) | `GET /admin/roles`, `GET /admin/roles/:roleId` only. There is no role table, no create, no delete. |
| Principals may be users or groups. (S1 s3, S2) | `principalType` is `user` or `group`; the caller's groups come from the verified token. |
| Markings are conjunctive: a user must be a member of all of them. Inherited down the hierarchy. (S1 s2) | Every Marking on the resource or any container must be held. |
| Users of one Organization cannot reach another's resources unless sharing is configured. (S1 s1) | A resource or container may list Organizations; the caller's Organization must be among them, at every level that lists any. Sharing across Organizations is not modelled. |
| Applying or removing a Marking is a sensitive action that takes effect on everything inside at once. (S1 s2) | `PUT /admin/resources/:rid/policy` needs Owner on the resource. |
| Removing a Marking is its own permission, separate from access to the data it protects. (S1 s2) | A platform administrator may read and replace a resource's policy without holding its Organizations or Markings, and nothing else; that is the way back from a Marking nobody holds. |
| A creator can use what they create. | The creator of an ontology, dataset or pipeline becomes its Owner (`grantCreatorOwner`). |
| A user sees only resources they can at least discover. (S1 s2 on discovery) | The ontology, dataset and pipeline listings are cut down with `filterDiscoverable`. |

Resource-role management follows S2's shape: `POST /admin/resources/{resourceRid}/roles/add` and `.../roles/remove` with a body of `roles: [{ principalId, principalType: USER | GROUP, roleId }]`, `GET .../roles` to list.

## Where it differs, on purpose

- **Project is not a type here.** Foundry makes the Project the primary security boundary.
  The ontology, dataset and pipeline each stand as their own container, under one platform root, and nothing sits between.
  A grant on the root plays the part of a space-wide grant.
- **Owner only may manage roles.** Foundry lets each role hand out its own level or lower (an Editor may add Viewers).
  Here Owner alone manages, which is stricter.
- **Folder and file role grants.** Foundry disables these by default and recommends keeping them off; they do not exist here at all.
- **Scoped sessions, access requests and cross-Organization sharing** are not implemented.
- **Platform administrator.** Foundry has no single bypass; we model it as Owner on the platform root, granted by the `ADMIN` or `SERVICE_ACCOUNT` platform role in the token.
  It reaches every resource through inheritance and stops at Organizations and Markings.
- **Resources are named by the identifier in the path.** The ontology service resolves an API name to its RID before checking, so a Marking on the RID binds a caller who uses the name.
  The objects and actions services store data under whatever `ontologyRid` string the path carries, so a grant or Marking there must be attached to the identifier callers use.
- **Groups and Markings are per-user lists in svc-multipass.** Foundry manages group and Marking membership as their own resources; here an operator sets them on the account (`users.group_ids`, `users.marking_ids`, through `src/cli/users.ts`) and svc-multipass signs them into the token as the `groups` and `markings` claims at every mint: password login, the `/authorize` code exchange, and refresh.
  A `client_credentials` client carries neither.

## Where the pieces are

- Roles, operations: `packages/permissions/src/roles.ts`.
- The decision: `packages/permissions/src/authorizer.ts`.
- Grants and policies, in memory or file (shared by every service, `/tmp/openfoundry-data/authorization.json`) and in Postgres (`resource_role_grants`, `resource_policies`): `packages/permissions/src/authorization-store.ts`, `db/migrations/014_resource_authorization.sql`, `scripts/migrate.sql`.
- Guarding a route: `requirePermission(operation)` in `packages/permissions/src/middleware.ts`, with the store registered per service by `registerAuthorization`.
- The verified identity: written by the gateway (`services/svc-gateway/src/proxy.ts`), read by `identityFromHeaders` in `packages/permissions/src/identity.ts`.
- The management API: `services/svc-admin/src/routes/v2/permissions.ts`.
- The proof: `packages/permissions/tests/authorization.test.ts` runs the same cases against the in-memory store, the shared file, and Postgres built from both schema sources; `services/svc-ontology/tests/authorization.test.ts` and `services/svc-admin/tests/resource-roles.test.ts` run them through the routes.
