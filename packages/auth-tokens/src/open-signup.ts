/**
 * Open signup switch.
 *
 * `POST /api/v2/auth/signup` mints a signed API token for a caller-chosen
 * username without persisting a user, so it is disabled unless an operator
 * turns it on explicitly. Unset or empty means OFF.
 */

export const OPEN_SIGNUP_ENV_VAR = "OPENFOUNDRY_ALLOW_OPEN_SIGNUP";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isOpenSignupEnabled(): boolean {
  const raw = process.env[OPEN_SIGNUP_ENV_VAR];
  if (raw === undefined) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
