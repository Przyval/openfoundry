import { describe, expect, it } from "vitest";
import { isRestorable } from "./session";

/**
 * Once the gateway enforces, restoring a session that cannot be refreshed
 * leaves the navbar showing the operator as logged in while every request
 * 401s. The dev password login mints no refresh token, so a reload an hour
 * later lands in exactly that case.
 */
describe("isRestorable", () => {
  const now = 1_700_000_000_000;

  it("restores a session still inside its deadline", () => {
    expect(isRestorable({ expiresAt: now + 60_000 }, now)).toBe(true);
  });

  it("refuses an expired session that has no refresh token", () => {
    expect(isRestorable({ expiresAt: now - 1 }, now)).toBe(false);
  });

  it("restores an expired session that can refresh itself", () => {
    expect(
      isRestorable({ expiresAt: now - 1, refreshToken: "refresh-1" }, now),
    ).toBe(true);
  });

  it("restores a session persisted before the deadline was recorded", () => {
    expect(isRestorable({}, now)).toBe(true);
  });
});
