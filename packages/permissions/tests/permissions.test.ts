import { describe, expect, it } from "vitest";
import {
  Permission,
  type PermissionGrant,
  type Role,
  PermissionEvaluator,
  RoleResolver,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// PermissionEvaluator — grants
// ---------------------------------------------------------------------------

describe("PermissionEvaluator", () => {
  const now = new Date();

  function makeGrant(
    subjectRid: string,
    resourceRid: string,
    permission: Permission,
  ): PermissionGrant {
    return {
      subjectRid,
      resourceRid,
      permission,
      grantedBy: "ri.auth.main.user.admin",
      grantedAt: now,
    };
  }

  it("grants and checks a single permission", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.READ,
    })).toBe(true);
  });

  it("returns false for a permission that was not granted", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.WRITE,
    })).toBe(false);
  });

  it("revokes a permission via removeGrant", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));
    evaluator.removeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.READ,
    })).toBe(false);
  });

  it("ADMIN implies all other permissions", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.ADMIN));

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.READ,
    })).toBe(true);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.WRITE,
    })).toBe(true);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.DELETE,
    })).toBe(true);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.EXECUTE,
    })).toBe(true);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.SHARE,
    })).toBe(true);

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.MANAGE_PERMISSIONS,
    })).toBe(true);
  });

  it("ADMIN check requires explicit ADMIN grant", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.WRITE));

    expect(evaluator.hasPermission({
      subjectRid: "ri.auth.main.user.alice",
      resourceRid: "ri.ontology.main.object.1",
      permission: Permission.ADMIN,
    })).toBe(false);
  });

  it("getPermissions returns all granted permissions", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.WRITE));

    const permissions = evaluator.getPermissions("ri.auth.main.user.alice", "ri.ontology.main.object.1");

    expect(permissions).toContain(Permission.READ);
    expect(permissions).toContain(Permission.WRITE);
    expect(permissions).toHaveLength(2);
  });

  it("getPermissions returns all permissions when ADMIN is granted", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.ADMIN));

    const permissions = evaluator.getPermissions("ri.auth.main.user.alice", "ri.ontology.main.object.1");

    expect(permissions).toContain(Permission.ADMIN);
    expect(permissions).toContain(Permission.READ);
    expect(permissions).toContain(Permission.WRITE);
    expect(permissions).toContain(Permission.DELETE);
    expect(permissions).toContain(Permission.EXECUTE);
    expect(permissions).toContain(Permission.SHARE);
    expect(permissions).toContain(Permission.MANAGE_PERMISSIONS);
    expect(permissions).toHaveLength(7);
  });

  it("getGrantsForResource returns all grants for a resource", () => {
    const evaluator = new PermissionEvaluator();
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.1", Permission.READ));
    evaluator.addGrant(makeGrant("ri.auth.main.user.bob", "ri.ontology.main.object.1", Permission.WRITE));
    evaluator.addGrant(makeGrant("ri.auth.main.user.alice", "ri.ontology.main.object.2", Permission.READ));

    const grants = evaluator.getGrantsForResource("ri.ontology.main.object.1");

    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.subjectRid)).toContain("ri.auth.main.user.alice");
    expect(grants.map((g) => g.subjectRid)).toContain("ri.auth.main.user.bob");
  });

  it("getGrantsForResource returns empty array for unknown resource", () => {
    const evaluator = new PermissionEvaluator();

    expect(evaluator.getGrantsForResource("ri.ontology.main.object.unknown")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RoleResolver
// ---------------------------------------------------------------------------

describe("RoleResolver", () => {
  const viewerRole: Role = {
    rid: "ri.auth.main.role.viewer",
    name: "Viewer",
    permissions: [Permission.READ],
    description: "Read-only access",
  };

  const editorRole: Role = {
    rid: "ri.auth.main.role.editor",
    name: "Editor",
    permissions: [Permission.READ, Permission.WRITE, Permission.DELETE],
  };

  const adminRole: Role = {
    rid: "ri.auth.main.role.admin",
    name: "Admin",
    permissions: [Permission.ADMIN],
  };

  it("assigns and retrieves roles for a subject", () => {
    const resolver = new RoleResolver();
    resolver.addRole(viewerRole);
    resolver.addRole(editorRole);
    resolver.assignRole("ri.auth.main.user.alice", viewerRole.rid);

    const roles = resolver.getRoles("ri.auth.main.user.alice");

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe("Viewer");
  });

  it("returns empty roles for unknown subject", () => {
    const resolver = new RoleResolver();

    expect(resolver.getRoles("ri.auth.main.user.unknown")).toEqual([]);
  });

  it("resolves permissions as union of all role permissions", () => {
    const resolver = new RoleResolver();
    resolver.addRole(viewerRole);
    resolver.addRole(editorRole);
    resolver.assignRole("ri.auth.main.user.alice", viewerRole.rid);
    resolver.assignRole("ri.auth.main.user.alice", editorRole.rid);

    const permissions = resolver.resolvePermissions("ri.auth.main.user.alice");

    // Union: READ (from both), WRITE, DELETE (from editor)
    expect(permissions).toContain(Permission.READ);
    expect(permissions).toContain(Permission.WRITE);
    expect(permissions).toContain(Permission.DELETE);
    expect(permissions).toHaveLength(3);
  });

  it("resolves empty permissions for subject with no roles", () => {
    const resolver = new RoleResolver();

    expect(resolver.resolvePermissions("ri.auth.main.user.unknown")).toEqual([]);
  });
});
