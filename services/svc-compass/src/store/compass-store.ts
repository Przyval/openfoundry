import { generateRid } from "@openfoundry/rid";
import { notFound, invalidArgument, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Resource shape
// ---------------------------------------------------------------------------

export type ResourceType = "FOLDER" | "PROJECT" | "SPACE";

export interface Resource {
  rid: string;
  name: string;
  type: ResourceType;
  parentRid: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  markings: string[];
}

export interface CreateResourceInput {
  name: string;
  type: ResourceType;
  parentRid?: string | null;
  description?: string;
  createdBy?: string;
  markings?: string[];
}

export interface UpdateResourceInput {
  name?: string;
  description?: string;
  markings?: string[];
}

// ---------------------------------------------------------------------------
// CompassStore — in-memory storage for compass resources
// ---------------------------------------------------------------------------

export class CompassStore {
  private readonly resources = new Map<string, Resource>();

  // -----------------------------------------------------------------------
  // Create
  // -----------------------------------------------------------------------

  createResource(input: CreateResourceInput): Resource {
    const parentRid = input.parentRid ?? null;

    // Validate parent exists if specified
    if (parentRid !== null) {
      if (!this.resources.has(parentRid)) {
        throw notFound("Resource", parentRid);
      }
    }

    // Check for duplicate name under same parent
    for (const r of this.resources.values()) {
      if (r.name === input.name && r.parentRid === parentRid) {
        throw conflict(
          "Resource",
          `name "${input.name}" already exists under parent ${parentRid ?? "root"}`,
        );
      }
    }

    const rid = generateRid("compass", "resource").toString();
    const now = new Date().toISOString();
    const resource: Resource = {
      rid,
      name: input.name,
      type: input.type,
      parentRid,
      description: input.description ?? "",
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? "system",
      markings: input.markings ?? [],
    };

    this.resources.set(rid, resource);
    return resource;
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  getResource(rid: string): Resource {
    const resource = this.resources.get(rid);
    if (!resource) {
      throw notFound("Resource", rid);
    }
    return resource;
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  updateResource(rid: string, input: UpdateResourceInput): Resource {
    const resource = this.resources.get(rid);
    if (!resource) {
      throw notFound("Resource", rid);
    }

    // Check for duplicate name under same parent if name is changing
    if (input.name !== undefined && input.name !== resource.name) {
      for (const r of this.resources.values()) {
        if (
          r.rid !== rid &&
          r.name === input.name &&
          r.parentRid === resource.parentRid
        ) {
          throw conflict(
            "Resource",
            `name "${input.name}" already exists under parent ${resource.parentRid ?? "root"}`,
          );
        }
      }
    }

    if (input.name !== undefined) resource.name = input.name;
    if (input.description !== undefined) resource.description = input.description;
    if (input.markings !== undefined) resource.markings = input.markings;
    resource.updatedAt = new Date().toISOString();

    return resource;
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  deleteResource(rid: string, recursive = false): void {
    if (!this.resources.has(rid)) {
      throw notFound("Resource", rid);
    }

    if (recursive) {
      this.deleteRecursive(rid);
    } else {
      // Check if resource has children
      const children = this.listChildren(rid);
      if (children.length > 0) {
        throw invalidArgument(
          "rid",
          "resource has children; use recursive=true to delete all descendants",
        );
      }
      this.resources.delete(rid);
    }
  }

  private deleteRecursive(rid: string): void {
    const children = this.listChildren(rid);
    for (const child of children) {
      this.deleteRecursive(child.rid);
    }
    this.resources.delete(rid);
  }

  // -----------------------------------------------------------------------
  // List children
  // -----------------------------------------------------------------------

  listChildren(parentRid: string | null): Resource[] {
    const results: Resource[] = [];
    for (const r of this.resources.values()) {
      if (r.parentRid === parentRid) {
        results.push(r);
      }
    }
    return results;
  }

  // -----------------------------------------------------------------------
  // List root resources
  // -----------------------------------------------------------------------

  listRootResources(): Resource[] {
    return this.listChildren(null);
  }

  // -----------------------------------------------------------------------
  // Get path (breadcrumb chain)
  // -----------------------------------------------------------------------

  getPath(rid: string): Resource[] {
    const path: Resource[] = [];
    let current: Resource | undefined = this.resources.get(rid);

    if (!current) {
      throw notFound("Resource", rid);
    }

    while (current) {
      path.unshift(current);
      if (current.parentRid === null) break;
      current = this.resources.get(current.parentRid);
    }

    return path;
  }

  // -----------------------------------------------------------------------
  // Move resource
  // -----------------------------------------------------------------------

  moveResource(rid: string, newParentRid: string | null): Resource {
    const resource = this.resources.get(rid);
    if (!resource) {
      throw notFound("Resource", rid);
    }

    // Cannot move to self
    if (newParentRid === rid) {
      throw invalidArgument("newParentRid", "cannot move a resource into itself");
    }

    // Validate new parent exists if specified
    if (newParentRid !== null) {
      if (!this.resources.has(newParentRid)) {
        throw notFound("Resource", newParentRid);
      }

      // Check for circular move: new parent cannot be a descendant of the resource
      if (this.isDescendant(newParentRid, rid)) {
        throw invalidArgument(
          "newParentRid",
          "cannot move a resource into one of its descendants (circular reference)",
        );
      }
    }

    // Check for duplicate name under new parent
    for (const r of this.resources.values()) {
      if (
        r.rid !== rid &&
        r.name === resource.name &&
        r.parentRid === newParentRid
      ) {
        throw conflict(
          "Resource",
          `name "${resource.name}" already exists under parent ${newParentRid ?? "root"}`,
        );
      }
    }

    resource.parentRid = newParentRid;
    resource.updatedAt = new Date().toISOString();

    return resource;
  }

  /**
   * Returns true if `candidateRid` is a descendant of `ancestorRid`.
   */
  private isDescendant(candidateRid: string, ancestorRid: string): boolean {
    let current = this.resources.get(candidateRid);
    while (current) {
      if (current.parentRid === ancestorRid) return true;
      if (current.parentRid === null) return false;
      current = this.resources.get(current.parentRid);
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  searchResources(query: string): Resource[] {
    const lower = query.toLowerCase();
    const results: Resource[] = [];
    for (const r of this.resources.values()) {
      if (r.name.toLowerCase().includes(lower)) {
        results.push(r);
      }
    }
    return results;
  }
}
