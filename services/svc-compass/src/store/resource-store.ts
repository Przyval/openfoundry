import { generateRid } from "@openfoundry/rid";
import { notFound, conflict, invalidArgument } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResourceType = "FOLDER" | "PROJECT" | "DATASET" | "ONTOLOGY" | "FILE";

export interface Resource {
  rid: string;
  type: ResourceType;
  name: string;
  path: string;
  parentRid?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  markings?: string[];
}

export interface CreateResourceInput {
  type: ResourceType;
  name: string;
  parentRid?: string;
  description?: string;
  createdBy?: string;
  markings?: string[];
}

export interface UpdateResourceInput {
  name?: string;
  parentRid?: string;
  description?: string;
  markings?: string[];
}

// ---------------------------------------------------------------------------
// ResourceStore — in-memory storage for compass resources
// ---------------------------------------------------------------------------

export class ResourceStore {
  private readonly resources = new Map<string, Resource>();

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private buildPath(name: string, parentRid?: string): string {
    if (!parentRid) {
      return `/${name}`;
    }
    const parent = this.resources.get(parentRid);
    if (!parent) {
      throw notFound("Resource", parentRid);
    }
    return `${parent.path}/${name}`;
  }

  private updateChildPaths(rid: string, _oldPath: string, newPath: string): void {
    for (const resource of this.resources.values()) {
      if (resource.parentRid === rid) {
        const childOldPath = resource.path;
        resource.path = `${newPath}/${resource.name}`;
        this.updateChildPaths(resource.rid, childOldPath, resource.path);
      }
    }
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  createResource(input: CreateResourceInput): Resource {
    // Check for duplicate name under same parent
    for (const r of this.resources.values()) {
      if (r.name === input.name && r.parentRid === input.parentRid) {
        throw conflict(
          "Resource",
          `name "${input.name}" already exists under parent ${input.parentRid ?? "root"}`,
        );
      }
    }

    const rid = generateRid("compass", input.type.toLowerCase()).toString();
    const now = new Date().toISOString();
    const path = this.buildPath(input.name, input.parentRid);

    const resource: Resource = {
      rid,
      type: input.type,
      name: input.name,
      path,
      parentRid: input.parentRid,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      markings: input.markings,
    };

    this.resources.set(rid, resource);
    return resource;
  }

  getResource(rid: string): Resource {
    const resource = this.resources.get(rid);
    if (!resource) {
      throw notFound("Resource", rid);
    }
    return resource;
  }

  getResourceByPath(path: string): Resource {
    for (const resource of this.resources.values()) {
      if (resource.path === path) {
        return resource;
      }
    }
    throw notFound("Resource", path);
  }

  listChildren(parentRid: string): Resource[] {
    // Verify parent exists
    this.getResource(parentRid);
    return Array.from(this.resources.values()).filter(
      (r) => r.parentRid === parentRid,
    );
  }

  listRootResources(): Resource[] {
    return Array.from(this.resources.values()).filter(
      (r) => r.parentRid === undefined,
    );
  }

  moveResource(rid: string, newParentRid: string): Resource {
    const resource = this.getResource(rid);

    // Verify new parent exists
    if (newParentRid) {
      this.getResource(newParentRid);
    }

    // Prevent moving a resource to itself or its descendant
    if (newParentRid === rid) {
      throw invalidArgument("parentRid", "cannot move a resource to itself");
    }

    const oldPath = resource.path;
    resource.parentRid = newParentRid || undefined;
    resource.path = this.buildPath(resource.name, resource.parentRid);
    resource.updatedAt = new Date().toISOString();

    // Update child paths
    this.updateChildPaths(rid, oldPath, resource.path);

    return resource;
  }

  renameResource(rid: string, newName: string): Resource {
    const resource = this.getResource(rid);

    // Check for duplicate name under same parent
    for (const r of this.resources.values()) {
      if (
        r.rid !== rid &&
        r.name === newName &&
        r.parentRid === resource.parentRid
      ) {
        throw conflict(
          "Resource",
          `name "${newName}" already exists under parent ${resource.parentRid ?? "root"}`,
        );
      }
    }

    const oldPath = resource.path;
    resource.name = newName;
    resource.path = this.buildPath(newName, resource.parentRid);
    resource.updatedAt = new Date().toISOString();

    // Update child paths
    this.updateChildPaths(rid, oldPath, resource.path);

    return resource;
  }

  updateResource(rid: string, input: UpdateResourceInput): Resource {
    const resource = this.getResource(rid);

    if (input.name !== undefined && input.name !== resource.name) {
      return this.renameResource(rid, input.name);
    }

    if (input.parentRid !== undefined && input.parentRid !== resource.parentRid) {
      return this.moveResource(rid, input.parentRid);
    }

    if (input.description !== undefined) {
      resource.description = input.description;
    }
    if (input.markings !== undefined) {
      resource.markings = input.markings;
    }
    resource.updatedAt = new Date().toISOString();

    return resource;
  }

  deleteResource(rid: string): void {
    if (!this.resources.has(rid)) {
      throw notFound("Resource", rid);
    }

    // Recursively delete children
    const children = Array.from(this.resources.values()).filter(
      (r) => r.parentRid === rid,
    );
    for (const child of children) {
      this.deleteResource(child.rid);
    }

    this.resources.delete(rid);
  }

  searchResources(query: string): Resource[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.resources.values()).filter(
      (r) =>
        r.name.toLowerCase().includes(lowerQuery) ||
        (r.description && r.description.toLowerCase().includes(lowerQuery)),
    );
  }
}
