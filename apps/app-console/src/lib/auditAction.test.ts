import { describe, expect, it } from "vitest";
import {
  auditActionVerb,
  describeEmptyAuditLog,
  intentForAction,
} from "./auditAction";

describe("auditActionVerb", () => {
  it("returns the verb of a dotted action", () => {
    expect(auditActionVerb("object.create")).toBe("CREATE");
    expect(auditActionVerb("permission.revoke")).toBe("REVOKE");
  });

  it("returns a bare verb unchanged apart from casing", () => {
    expect(auditActionVerb("CREATE")).toBe("CREATE");
    expect(auditActionVerb("delete")).toBe("DELETE");
  });
});

describe("intentForAction", () => {
  it("colours dotted actions by their verb", () => {
    expect(intentForAction("object.create")).toBe("success");
    expect(intentForAction("object.update")).toBe("primary");
    expect(intentForAction("object.delete")).toBe("danger");
  });

  it("colours bare verbs the same as their dotted form", () => {
    for (const verb of ["CREATE", "UPDATE", "DELETE", "EXECUTE"]) {
      expect(intentForAction(verb)).toBe(intentForAction(`object.${verb.toLowerCase()}`));
    }
  });

  it("falls back to no intent for an unrecognised action", () => {
    expect(intentForAction("user.login")).toBe("none");
    expect(intentForAction("sync.run")).toBe("none");
  });
});

describe("describeEmptyAuditLog", () => {
  it("reports an uneventful trail when the log is available", () => {
    const { title, description } = describeEmptyAuditLog(true);
    expect(title).toBe("No audit entries");
    expect(description).toContain("as actions are performed");
  });

  it("says why the trail is empty when it is unavailable", () => {
    const { title, description } = describeEmptyAuditLog(false);
    expect(title).not.toBe("No audit entries");
    expect(description).toContain("without a database");
    expect(description).toContain("DATABASE_URL");
  });

  it("distinguishes the two states", () => {
    expect(describeEmptyAuditLog(true)).not.toEqual(describeEmptyAuditLog(false));
  });
});
