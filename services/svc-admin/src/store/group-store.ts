import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredGroup {
  rid: string;
  name: string;
  description?: string;
  members: Set<string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// GroupStore — in-memory storage for group entities
// ---------------------------------------------------------------------------

export class GroupStore {
  private readonly groups = new Map<string, StoredGroup>();

  createGroup(input: CreateGroupInput): StoredGroup {
    // Check for duplicate name
    for (const g of this.groups.values()) {
      if (g.name === input.name) {
        throw conflict("Group", `name "${input.name}" already exists`);
      }
    }

    const rid = generateRid("multipass", "group").toString();
    const now = new Date().toISOString();

    const group: StoredGroup = {
      rid,
      name: input.name,
      description: input.description,
      members: new Set(),
      createdAt: now,
      updatedAt: now,
    };

    this.groups.set(rid, group);
    return group;
  }

  getGroup(rid: string): StoredGroup {
    const group = this.groups.get(rid);
    if (!group) {
      throw notFound("Group", rid);
    }
    return group;
  }

  listGroups(): StoredGroup[] {
    return Array.from(this.groups.values());
  }

  deleteGroup(rid: string): void {
    if (!this.groups.has(rid)) {
      throw notFound("Group", rid);
    }
    this.groups.delete(rid);
  }

  addMember(groupRid: string, userRid: string): void {
    const group = this.getGroup(groupRid);
    if (group.members.has(userRid)) {
      throw conflict("GroupMember", `user "${userRid}" is already a member of group "${groupRid}"`);
    }
    group.members.add(userRid);
    group.updatedAt = new Date().toISOString();
  }

  removeMember(groupRid: string, userRid: string): void {
    const group = this.getGroup(groupRid);
    if (!group.members.has(userRid)) {
      throw notFound("GroupMember", userRid);
    }
    group.members.delete(userRid);
    group.updatedAt = new Date().toISOString();
  }

  getMembers(groupRid: string): string[] {
    const group = this.getGroup(groupRid);
    return Array.from(group.members);
  }

  getGroupsForUser(userRid: string): StoredGroup[] {
    return Array.from(this.groups.values()).filter((g) =>
      g.members.has(userRid),
    );
  }
}
