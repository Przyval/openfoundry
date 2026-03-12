import { type Role, type Permission } from "./permission-types.js";

/**
 * Resolves permissions for subjects based on their assigned roles.
 *
 * Roles are collections of permissions. A subject can be assigned multiple
 * roles, and their effective permissions are the union of all role permissions.
 */
export class RoleResolver {
  private readonly roles = new Map<string, Role>();
  private readonly assignments = new Map<string, Set<string>>();

  /**
   * Register a role definition.
   */
  addRole(role: Role): void {
    this.roles.set(role.rid, role);
  }

  /**
   * Assign a role to a subject.
   *
   * @param subjectRid - The RID of the subject (user, group, or service).
   * @param roleRid    - The RID of the role to assign.
   */
  assignRole(subjectRid: string, roleRid: string): void {
    let subjectRoles = this.assignments.get(subjectRid);
    if (!subjectRoles) {
      subjectRoles = new Set();
      this.assignments.set(subjectRid, subjectRoles);
    }
    subjectRoles.add(roleRid);
  }

  /**
   * Get all roles assigned to a subject.
   */
  getRoles(subjectRid: string): Role[] {
    const roleRids = this.assignments.get(subjectRid);
    if (!roleRids) {
      return [];
    }

    const roles: Role[] = [];
    for (const rid of roleRids) {
      const role = this.roles.get(rid);
      if (role) {
        roles.push(role);
      }
    }

    return roles;
  }

  /**
   * Resolve the effective permissions for a subject by computing the
   * union of all permissions from their assigned roles.
   */
  resolvePermissions(subjectRid: string): Permission[] {
    const roles = this.getRoles(subjectRid);
    const permissionSet = new Set<Permission>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissionSet.add(permission);
      }
    }

    return Array.from(permissionSet);
  }
}
