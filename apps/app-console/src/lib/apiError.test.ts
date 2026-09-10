import { describe, expect, it } from "vitest";
import { apiErrorMessage, describeApiError } from "./apiError";

/** A failed response carrying OpenFoundry's error envelope. */
function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("describeApiError", () => {
  it("names the entity a NotFound error was raised for", () => {
    expect(
      describeApiError(404, {
        errorName: "UserNotFound",
        parameters: { entityType: "User", entityId: "ri.multipass.main.user.x" },
      }),
    ).toBe("User not found: ri.multipass.main.user.x");
  });

  it("spaces out a compound entity type", () => {
    expect(
      describeApiError(404, {
        errorName: "GroupMemberNotFound",
        parameters: { entityType: "GroupMember", entityId: "ri.x" },
      }),
    ).toBe("Group member not found: ri.x");
  });

  it("explains a conflict in terms of the resource", () => {
    expect(
      describeApiError(409, {
        errorName: "Conflict",
        parameters: { resource: "Group", reason: 'name "ops" already exists' },
      }),
    ).toBe('Group name "ops" already exists.');
  });

  it("explains a permission denial", () => {
    expect(
      describeApiError(403, {
        errorName: "PermissionDenied",
        parameters: { resource: "Group", action: "manage" },
      }),
    ).toBe("Permission denied: you cannot manage Group.");
  });

  it("reports the first validation failure", () => {
    expect(
      describeApiError(400, {
        errorName: "ValidationError",
        parameters: {
          validationErrors: [{ message: "must have required property 'principalIds'" }],
        },
      }),
    ).toBe(
      "The request was rejected as invalid: must have required property 'principalIds'.",
    );
  });

  it("falls back to the error name when the parameters say nothing", () => {
    expect(describeApiError(418, { errorName: "Teapot" })).toBe(
      "Teapot (HTTP 418).",
    );
  });

  it("falls back to the status when there is no envelope", () => {
    expect(describeApiError(502, "<html>bad gateway</html>")).toBe(
      "Request failed with HTTP 502.",
    );
  });
});

describe("apiErrorMessage", () => {
  it("reads the envelope off a failed response", async () => {
    const res = errorResponse(404, {
      errorName: "UserNotFound",
      parameters: { entityType: "User", entityId: "nope" },
    });
    await expect(apiErrorMessage(res)).resolves.toBe("User not found: nope");
  });

  it("survives a response whose body is not JSON", async () => {
    const res = new Response("upstream exploded", { status: 500 });
    await expect(apiErrorMessage(res)).resolves.toBe(
      "Request failed with HTTP 500.",
    );
  });
});
