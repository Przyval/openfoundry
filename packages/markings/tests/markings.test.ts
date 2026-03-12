import { describe, it, expect } from "vitest";
import {
  MarkingType,
  MarkingEvaluator,
  ClassificationLevel,
  classificationToString,
  parseClassification,
  meetsClassification,
  CLASSIFICATION_HIERARCHY,
} from "../src/index.js";
import type { Marking } from "../src/index.js";

function makeMarking(
  id: string,
  type: MarkingType,
  category = "default",
): Marking {
  return {
    rid: `ri.markings..marking.${id}`,
    markingId: id,
    displayName: id.toUpperCase(),
    type,
    category,
  };
}

describe("markings", () => {
  // --- Marking registration ---

  it("should register markings and use them for evaluation", () => {
    const evaluator = new MarkingEvaluator();
    const m = makeMarking("m1", MarkingType.MANDATORY);
    evaluator.registerMarking(m);
    evaluator.setUserMarkings("user:1", ["m1"]);
    expect(evaluator.canAccess("user:1", ["m1"])).toBe(true);
  });

  // --- Mandatory markings ---

  it("should deny access when user lacks a mandatory marking", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("m1", MarkingType.MANDATORY));
    evaluator.registerMarking(makeMarking("m2", MarkingType.MANDATORY));
    evaluator.setUserMarkings("user:1", ["m1"]);
    expect(evaluator.canAccess("user:1", ["m1", "m2"])).toBe(false);
  });

  it("should allow access when user has all mandatory markings", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("m1", MarkingType.MANDATORY));
    evaluator.registerMarking(makeMarking("m2", MarkingType.MANDATORY));
    evaluator.setUserMarkings("user:1", ["m1", "m2"]);
    expect(evaluator.canAccess("user:1", ["m1", "m2"])).toBe(true);
  });

  // --- Discretionary markings ---

  it("should allow access when user has at least one discretionary marking", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("d1", MarkingType.DISCRETIONARY));
    evaluator.registerMarking(makeMarking("d2", MarkingType.DISCRETIONARY));
    evaluator.setUserMarkings("user:1", ["d1"]);
    expect(evaluator.canAccess("user:1", ["d1", "d2"])).toBe(true);
  });

  it("should deny access when user has none of the discretionary markings", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("d1", MarkingType.DISCRETIONARY));
    evaluator.registerMarking(makeMarking("d2", MarkingType.DISCRETIONARY));
    evaluator.setUserMarkings("user:1", []);
    expect(evaluator.canAccess("user:1", ["d1", "d2"])).toBe(false);
  });

  // --- Mixed mandatory + discretionary ---

  it("should require all mandatory AND at least one discretionary", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("m1", MarkingType.MANDATORY));
    evaluator.registerMarking(makeMarking("d1", MarkingType.DISCRETIONARY));
    evaluator.registerMarking(makeMarking("d2", MarkingType.DISCRETIONARY));

    evaluator.setUserMarkings("user:1", ["m1", "d1"]);
    expect(evaluator.canAccess("user:1", ["m1", "d1", "d2"])).toBe(true);

    evaluator.setUserMarkings("user:2", ["m1"]);
    expect(evaluator.canAccess("user:2", ["m1", "d1", "d2"])).toBe(false);

    evaluator.setUserMarkings("user:3", ["d1"]);
    expect(evaluator.canAccess("user:3", ["m1", "d1", "d2"])).toBe(false);
  });

  // --- No markings ---

  it("should allow access to unmarked resources", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.setUserMarkings("user:1", []);
    expect(evaluator.canAccess("user:1", [])).toBe(true);
  });

  it("should deny access when user has no markings set and resource has markings", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("m1", MarkingType.MANDATORY));
    expect(evaluator.canAccess("unknown-user", ["m1"])).toBe(false);
  });

  // --- filterAccessible ---

  it("should filter resources by user access", () => {
    const evaluator = new MarkingEvaluator();
    evaluator.registerMarking(makeMarking("m1", MarkingType.MANDATORY));
    evaluator.registerMarking(makeMarking("m2", MarkingType.MANDATORY));
    evaluator.setUserMarkings("user:1", ["m1"]);

    const resources = [
      { id: "a", markings: ["m1"] },
      { id: "b", markings: ["m1", "m2"] },
      { id: "c", markings: [] },
    ];
    const accessible = evaluator.filterAccessible("user:1", resources);
    expect(accessible.map((r) => r.id)).toEqual(["a", "c"]);
  });

  // --- Classification toString ---

  it("should format TOP_SECRET with compartments and releasability", () => {
    const result = classificationToString({
      level: ClassificationLevel.TOP_SECRET,
      compartments: ["SI"],
      releasableTo: ["USA", "GBR"],
    });
    expect(result).toBe("TOP SECRET//SI//REL TO USA, GBR");
  });

  it("should format a plain SECRET classification", () => {
    const result = classificationToString({
      level: ClassificationLevel.SECRET,
      compartments: [],
      releasableTo: [],
    });
    expect(result).toBe("SECRET");
  });

  // --- Classification parsing ---

  it("should parse a classification banner string", () => {
    const sc = parseClassification("TOP SECRET//SI//REL TO USA, GBR");
    expect(sc.level).toBe(ClassificationLevel.TOP_SECRET);
    expect(sc.compartments).toEqual(["SI"]);
    expect(sc.releasableTo).toEqual(["USA", "GBR"]);
  });

  it("should parse a simple classification string", () => {
    const sc = parseClassification("UNCLASSIFIED");
    expect(sc.level).toBe(ClassificationLevel.UNCLASSIFIED);
    expect(sc.compartments).toEqual([]);
    expect(sc.releasableTo).toEqual([]);
  });

  // --- meetsClassification ---

  it("should correctly compare classification levels", () => {
    expect(meetsClassification(ClassificationLevel.TOP_SECRET, ClassificationLevel.SECRET)).toBe(true);
    expect(meetsClassification(ClassificationLevel.SECRET, ClassificationLevel.SECRET)).toBe(true);
    expect(meetsClassification(ClassificationLevel.CONFIDENTIAL, ClassificationLevel.SECRET)).toBe(false);
    expect(meetsClassification(ClassificationLevel.UNCLASSIFIED, ClassificationLevel.UNCLASSIFIED)).toBe(true);
  });

  // --- Hierarchy ---

  it("should define the correct classification hierarchy order", () => {
    expect(CLASSIFICATION_HIERARCHY).toEqual([
      ClassificationLevel.UNCLASSIFIED,
      ClassificationLevel.CONFIDENTIAL,
      ClassificationLevel.SECRET,
      ClassificationLevel.TOP_SECRET,
    ]);
  });
});
