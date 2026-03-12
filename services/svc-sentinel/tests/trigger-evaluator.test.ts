import { describe, it, expect } from "vitest";
import { evaluateTrigger } from "../src/triggers/trigger-evaluator.js";

// -------------------------------------------------------------------------
// SCHEDULE trigger
// -------------------------------------------------------------------------

describe("SCHEDULE trigger", () => {
  it("fires when cron matches current time", () => {
    // Cron: every minute of every hour
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "* * * * *" } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(true);
  });

  it("fires when specific minute matches", () => {
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "30 10 * * *" } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when minute does not match", () => {
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "15 10 * * *" } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(false);
  });

  it("supports step patterns (*/5)", () => {
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "*/5 * * * *" } },
      { now: new Date("2026-03-12T10:30:00Z") }, // minute=30, 30%5===0
    );
    expect(result.fired).toBe(true);
  });

  it("supports range patterns (1-5)", () => {
    // Thursday = day 4
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "* * * * 1-5" } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(true);
  });

  it("supports comma-separated values", () => {
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "0,15,30,45 * * * *" } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(true);
  });

  it("rejects invalid cron with wrong number of fields", () => {
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { cron: "* *" } },
      { now: new Date() },
    );
    expect(result.fired).toBe(false);
    expect(result.reason).toContain("Invalid cron");
  });

  it("supports intervalMinutes", () => {
    // 10:30 => minuteOfDay=630, 630%15===0
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { intervalMinutes: 15 } },
      { now: new Date("2026-03-12T10:30:00Z") },
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when intervalMinutes does not match", () => {
    // 10:31 => minuteOfDay=631, 631%15!==0
    const result = evaluateTrigger(
      { type: "SCHEDULE", config: { intervalMinutes: 15 } },
      { now: new Date("2026-03-12T10:31:00Z") },
    );
    expect(result.fired).toBe(false);
  });
});

// -------------------------------------------------------------------------
// OBJECT_CHANGED trigger
// -------------------------------------------------------------------------

describe("OBJECT_CHANGED trigger", () => {
  it("fires when watched property changed", () => {
    const result = evaluateTrigger(
      { type: "OBJECT_CHANGED", config: { properties: ["status", "salary"] } },
      {
        oldObject: { status: "active", salary: 50000 },
        newObject: { status: "inactive", salary: 50000 },
      },
    );
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("status");
  });

  it("does not fire when no watched properties changed", () => {
    const result = evaluateTrigger(
      { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
      {
        oldObject: { status: "active", name: "Alice" },
        newObject: { status: "active", name: "Bob" },
      },
    );
    expect(result.fired).toBe(false);
  });

  it("reports multiple changed properties", () => {
    const result = evaluateTrigger(
      { type: "OBJECT_CHANGED", config: { properties: ["status", "salary"] } },
      {
        oldObject: { status: "active", salary: 50000 },
        newObject: { status: "inactive", salary: 60000 },
      },
    );
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("status");
    expect(result.reason).toContain("salary");
  });

  it("does not fire when old/new objects are missing", () => {
    const result = evaluateTrigger(
      { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
      {},
    );
    expect(result.fired).toBe(false);
  });
});

// -------------------------------------------------------------------------
// PROPERTY_THRESHOLD trigger
// -------------------------------------------------------------------------

describe("PROPERTY_THRESHOLD trigger", () => {
  it("fires when value exceeds ABOVE threshold", () => {
    const result = evaluateTrigger(
      {
        type: "PROPERTY_THRESHOLD",
        config: { threshold: 100, direction: "ABOVE" },
      },
      { currentValue: 150 },
    );
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("150");
    expect(result.reason).toContain("100");
  });

  it("does not fire when value is below ABOVE threshold", () => {
    const result = evaluateTrigger(
      {
        type: "PROPERTY_THRESHOLD",
        config: { threshold: 100, direction: "ABOVE" },
      },
      { currentValue: 50 },
    );
    expect(result.fired).toBe(false);
  });

  it("fires when value is below BELOW threshold", () => {
    const result = evaluateTrigger(
      {
        type: "PROPERTY_THRESHOLD",
        config: { threshold: 10, direction: "BELOW" },
      },
      { currentValue: 5 },
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when no current value provided", () => {
    const result = evaluateTrigger(
      {
        type: "PROPERTY_THRESHOLD",
        config: { threshold: 100, direction: "ABOVE" },
      },
      {},
    );
    expect(result.fired).toBe(false);
  });

  it("does not fire when value exactly equals threshold (ABOVE)", () => {
    const result = evaluateTrigger(
      {
        type: "PROPERTY_THRESHOLD",
        config: { threshold: 100, direction: "ABOVE" },
      },
      { currentValue: 100 },
    );
    expect(result.fired).toBe(false);
  });
});
