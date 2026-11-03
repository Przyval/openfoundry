export {
  ROLES,
  ROLE_IDS,
  OPERATION_ROLES,
  PLATFORM_ROLES,
  isRoleId,
  roleSatisfies,
  assignableRoles,
  canonicalPlatformRole,
  hasPlatformAdminRole,
  type RoleId,
  type RoleDefinition,
  type Operation,
} from "./roles.js";

export {
  IDENTITY_HEADERS,
  identityFromHeaders,
  identityFromClaims,
  identityToHeaders,
  type Identity,
} from "./identity.js";

export {
  ROOT_RESOURCE,
  FileAuthorizationStore,
  PgAuthorizationStore,
  createAuthorizationStore,
  type AuthorizationStore,
  type RoleGrant,
  type ResourcePolicy,
  type PrincipalRef,
  type PrincipalType,
} from "./authorization-store.js";

export { evaluate, principalsOf, type Denial } from "./authorizer.js";

export {
  registerAuthorization,
  requirePermission,
  requireCaller,
  defaultResourceChain,
  grantCreatorOwner,
  filterDiscoverable,
  setEnforcePermissions,
  type RequirePermissionOptions,
  type ResourceChain,
  type ResourceAlias,
} from "./middleware.js";
