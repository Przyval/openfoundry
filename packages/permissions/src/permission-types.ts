/**
 * The set of permissions supported by the OpenFoundry platform,
 * covering the 6 permission models from Palantir plus MANAGE_PERMISSIONS.
 */
export enum Permission {
  READ = "READ",
  WRITE = "WRITE",
  DELETE = "DELETE",
  ADMIN = "ADMIN",
  EXECUTE = "EXECUTE",
  SHARE = "SHARE",
  MANAGE_PERMISSIONS = "MANAGE_PERMISSIONS",
}

/**
 * A named role that bundles a set of permissions together.
 */
export interface Role {
  /** Resource identifier for this role. */
  readonly rid: string;

  /** Human-readable name for this role. */
  readonly name: string;

  /** The permissions granted by this role. */
  readonly permissions: Permission[];

  /** Optional description of the role's purpose. */
  readonly description?: string;
}

/**
 * A grant of a specific permission from one subject to a resource.
 */
export interface PermissionGrant {
  /** The RID of the subject (user, group, or service) receiving the permission. */
  readonly subjectRid: string;

  /** The RID of the resource being granted access to. */
  readonly resourceRid: string;

  /** The specific permission being granted. */
  readonly permission: Permission;

  /** The RID of the entity that issued this grant. */
  readonly grantedBy: string;

  /** When this grant was created. */
  readonly grantedAt: Date;
}

/**
 * A request to check whether a subject has a specific permission on a resource.
 */
export interface PermissionCheck {
  /** The RID of the subject to check. */
  readonly subjectRid: string;

  /** The RID of the resource to check against. */
  readonly resourceRid: string;

  /** The permission to verify. */
  readonly permission: Permission;
}
