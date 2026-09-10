import { describe, expect, it } from "vitest";
import { auditActionVerb, intentForAction } from "./auditAction";

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
