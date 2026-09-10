import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  foundryBranchNotFound,
  ontologyScenarioNotFound,
  ontologyTransactionNotFound,
  rejectUnsupportedOntologyScoping,
  OpenFoundryApiError,
} from "../src/index.js";

describe("ontology scoping errors", () => {
  it("shapes a branch rejection the way FoundryBranchNotFound is declared", () => {
    const err = foundryBranchNotFound("experiment");
    expect(err.errorName).toBe("FoundryBranchNotFound");
    expect(err.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(err.statusCode).toBe(404);
    expect(err.toJSON().parameters).toEqual({ branch: "experiment" });
  });

  it("names the requested scenario and transaction in the error parameters", () => {
    expect(ontologyScenarioNotFound("ri.scenario.1").toJSON().parameters).toEqual({
      scenarioRid: "ri.scenario.1",
    });
    expect(ontologyTransactionNotFound("txn-1").toJSON().parameters).toEqual({
      transactionId: "txn-1",
    });
  });
});

describe("rejectUnsupportedOntologyScoping", () => {
  it("passes through when nothing was scoped", () => {
    expect(() => rejectUnsupportedOntologyScoping({})).not.toThrow();
  });

  it("treats an empty value as absent, since it names nothing", () => {
    expect(() =>
      rejectUnsupportedOntologyScoping({
        branch: "",
        scenarioRid: "",
        transactionId: "",
      }),
    ).not.toThrow();
  });

  it("rejects each parameter with its own error", () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ branch: "master" }, "FoundryBranchNotFound"],
      [{ scenarioRid: "ri.scenario.1" }, "OntologyScenarioNotFound"],
      [{ transactionId: "txn-1" }, "OntologyTransactionNotFound"],
    ];

    for (const [params, errorName] of cases) {
      let thrown: unknown;
      try {
        rejectUnsupportedOntologyScoping(params);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(OpenFoundryApiError);
      expect((thrown as OpenFoundryApiError).errorName).toBe(errorName);
      expect((thrown as OpenFoundryApiError).statusCode).toBe(404);
    }
  });

  it("reports the branch first when several are supplied", () => {
    expect(() =>
      rejectUnsupportedOntologyScoping({
        branch: "master",
        scenarioRid: "ri.scenario.1",
      }),
    ).toThrow(/foundry branch/i);
  });
});
