import {
  Permission,
  type PermissionGrant,
  type PermissionCheck,
} from "./permission-types.js";

/**
 * All permissions that ADMIN implies — every permission except ADMIN itself.
 */
const ADMIN_IMPLIED_PERMISSIONS: readonly Permission[] = [
  Permission.READ,
  Permission.WRITE,
  Permission.DELETE,
  Permission.EXECUTE,
  Permission.SHARE,
  Permission.MANAGE_PERMISSIONS,
];

/**
 * Evaluates permission checks against a set of grants.
 *
 * ADMIN permission implies all other permissions — if a subject has ADMIN
 * on a resource, any permission check for that resource will return true.
 */
export class PermissionEvaluator {
  /**
   * Grants indexed by a composite key of `subjectRid:resourceRid:permission`.
   */
  private readonly grants = new Map<string, PermissionGrant>();

  /**
   * Secondary index: grants indexed by resourceRid for efficient lookup.
   */
  private readonly grantsByResource = new Map<string, Set<string>>();

  /**
   * Add a permission grant.
   */
  addGrant(grant: PermissionGrant): void {
    const key = this.makeKey(grant.subjectRid, grant.resourceRid, grant.permission);
    this.grants.set(key, grant);

    let resourceKeys = this.grantsByResource.get(grant.resourceRid);
    if (!resourceKeys) {
      resourceKeys = new Set();
      this.grantsByResource.set(grant.resourceRid, resourceKeys);
    }
    resourceKeys.add(key);
  }

  /**
   * Remove a specific permission grant.
   */
  removeGrant(
    subjectRid: string,
    resourceRid: string,
    permission: Permission,
  ): void {
    const key = this.makeKey(subjectRid, resourceRid, permission);
    this.grants.delete(key);

    const resourceKeys = this.grantsByResource.get(resourceRid);
    if (resourceKeys) {
      resourceKeys.delete(key);
      if (resourceKeys.size === 0) {
        this.grantsByResource.delete(resourceRid);
      }
    }
  }

  /**
   * Check whether a subject has a specific permission on a resource.
   *
   * Returns true if there is an explicit grant for the permission, OR if
   * the subject has ADMIN on the resource (which implies all other permissions).
   */
  hasPermission(check: PermissionCheck): boolean {
    // Direct grant check
    const directKey = this.makeKey(check.subjectRid, check.resourceRid, check.permission);
    if (this.grants.has(directKey)) {
      return true;
    }

    // ADMIN implies all other permissions
    if (check.permission !== Permission.ADMIN) {
      const adminKey = this.makeKey(check.subjectRid, check.resourceRid, Permission.ADMIN);
      if (this.grants.has(adminKey)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions a subject has on a specific resource.
   *
   * If the subject has ADMIN, all permissions are returned.
   */
  getPermissions(subjectRid: string, resourceRid: string): Permission[] {
    const permissions: Permission[] = [];

    // Check if subject has ADMIN — if so, return all permissions
    const adminKey = this.makeKey(subjectRid, resourceRid, Permission.ADMIN);
    if (this.grants.has(adminKey)) {
      return [Permission.ADMIN, ...ADMIN_IMPLIED_PERMISSIONS];
    }

    for (const permission of Object.values(Permission)) {
      const key = this.makeKey(subjectRid, resourceRid, permission);
      if (this.grants.has(key)) {
        permissions.push(permission);
      }
    }

    return permissions;
  }

  /**
   * Get all grants for a specific resource.
   */
  getGrantsForResource(resourceRid: string): PermissionGrant[] {
    const resourceKeys = this.grantsByResource.get(resourceRid);
    if (!resourceKeys) {
      return [];
    }

    const grants: PermissionGrant[] = [];
    for (const key of resourceKeys) {
      const grant = this.grants.get(key);
      if (grant) {
        grants.push(grant);
      }
    }

    return grants;
  }

  private makeKey(subjectRid: string, resourceRid: string, permission: Permission): string {
    return `${subjectRid}:${resourceRid}:${permission}`;
  }
}
