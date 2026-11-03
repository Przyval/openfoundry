import { permissionDenied } from "@openfoundry/errors";
import { ROOT_RESOURCE, type AuthorizationStore, type PrincipalRef } from "./authorization-store.js";
import type { Identity } from "./identity.js";
import { OPERATION_ROLES, roleSatisfies, type Operation, type RoleId } from "./roles.js";

export type Denial =
  | { layer: "organization"; detail: string }
  | { layer: "marking"; detail: string }
  | { layer: "role"; detail: string };

export function principalsOf(identity: Identity): PrincipalRef[] {
  return [
    { principalType: "user", principalId: identity.userId },
    ...identity.groups.map((g) => ({ principalType: "group" as const, principalId: g })),
  ];
}

/**
 * Decide whether `identity` may perform `operation` on the resource whose
 * ancestry is `chain` (the resource first, the platform root last).
 *
 * Foundry's order, and the reason for it: the mandatory controls come first
 * and bind everyone, administrators included - Organizations and Markings
 * "will always prevent an ineligible user from accessing a resource,
 * regardless of the user's role". Only then does a role matter, and a role
 * held anywhere up the chain counts, because roles are inherited downwards.
 *
 * @returns undefined when allowed, otherwise the layer that said no.
 */
export async function evaluate(
  store: AuthorizationStore,
  identity: Identity,
  operation: Operation,
  chain: readonly string[],
): Promise<Denial | undefined> {
  const policies = await store.policiesFor(chain);

  for (const policy of policies) {
    if (
      policy.organizations.length > 0 &&
      (identity.organization === undefined || !policy.organizations.includes(identity.organization))
    ) {
      return { layer: "organization", detail: policy.resourceRid };
    }
  }

  const held = new Set(identity.markings);
  for (const policy of policies) {
    for (const marking of policy.markings) {
      if (!held.has(marking)) return { layer: "marking", detail: marking };
    }
  }

  const required: RoleId = OPERATION_ROLES[operation];
  if (identity.platformAdmin) return undefined; // Owner on the root, inherited everywhere

  const grants = await store.grantsFor([...chain, ROOT_RESOURCE], principalsOf(identity));
  if (grants.some((g) => roleSatisfies(g.roleId, required))) return undefined;
  return { layer: "role", detail: required };
}

export function denialError(chain: readonly string[], operation: Operation): ReturnType<typeof permissionDenied> {
  return permissionDenied(chain[0] ?? ROOT_RESOURCE, operation);
}
