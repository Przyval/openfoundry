import { describe, expect, it } from "vitest";
import { MEMBERS_PAGE_SIZE, describeMemberTruncation } from "./groupMembers";

describe("MEMBERS_PAGE_SIZE", () => {
  it("stays within the page size the server will honour without clamping", () => {
    expect(MEMBERS_PAGE_SIZE).toBeGreaterThan(0);
    expect(MEMBERS_PAGE_SIZE).toBeLessThanOrEqual(10_000);
  });
});

describe("describeMemberTruncation", () => {
  it("says nothing when the page holds the whole membership", () => {
    expect(describeMemberTruncation(3, undefined)).toBeNull();
    expect(describeMemberTruncation(0, undefined)).toBeNull();
  });

  it("reports how many are shown when more members exist", () => {
    const notice = describeMemberTruncation(1000, "eyJvZmZzZXQiOjEwMDB9");
    expect(notice).not.toBeNull();
    expect(notice).toContain("1000");
    expect(notice).toContain("more");
  });
});
