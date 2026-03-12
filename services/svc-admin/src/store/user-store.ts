import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface StoredUser {
  rid: string;
  username: string;
  email: string;
  displayName: string;
  attributes: Record<string, string>;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  displayName: string;
  attributes?: Record<string, string>;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  attributes?: Record<string, string>;
  status?: UserStatus;
}

// ---------------------------------------------------------------------------
// UserStore — in-memory storage for user entities
// ---------------------------------------------------------------------------

export class UserStore {
  private readonly users = new Map<string, StoredUser>();

  createUser(input: CreateUserInput): StoredUser {
    // Check for duplicate username
    for (const u of this.users.values()) {
      if (u.username === input.username) {
        throw conflict("User", `username "${input.username}" already exists`);
      }
    }
    // Check for duplicate email
    for (const u of this.users.values()) {
      if (u.email === input.email) {
        throw conflict("User", `email "${input.email}" already exists`);
      }
    }

    const rid = generateRid("multipass", "user").toString();
    const now = new Date().toISOString();

    const user: StoredUser = {
      rid,
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      attributes: input.attributes ?? {},
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(rid, user);
    return user;
  }

  getUser(rid: string): StoredUser {
    const user = this.users.get(rid);
    if (!user) {
      throw notFound("User", rid);
    }
    return user;
  }

  getUserByUsername(username: string): StoredUser {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    throw notFound("User", username);
  }

  listUsers(): StoredUser[] {
    return Array.from(this.users.values());
  }

  updateUser(rid: string, input: UpdateUserInput): StoredUser {
    const user = this.getUser(rid);

    if (input.email !== undefined) {
      // Check for duplicate email
      for (const u of this.users.values()) {
        if (u.rid !== rid && u.email === input.email) {
          throw conflict("User", `email "${input.email}" already exists`);
        }
      }
      user.email = input.email;
    }
    if (input.displayName !== undefined) {
      user.displayName = input.displayName;
    }
    if (input.attributes !== undefined) {
      user.attributes = input.attributes;
    }
    if (input.status !== undefined) {
      user.status = input.status;
    }
    user.updatedAt = new Date().toISOString();

    return user;
  }

  deleteUser(rid: string): StoredUser {
    const user = this.getUser(rid);
    user.status = "INACTIVE";
    user.updatedAt = new Date().toISOString();
    return user;
  }

  searchUsers(query: string): StoredUser[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.users.values()).filter(
      (u) =>
        u.username.toLowerCase().includes(lowerQuery) ||
        u.email.toLowerCase().includes(lowerQuery) ||
        u.displayName.toLowerCase().includes(lowerQuery),
    );
  }
}
