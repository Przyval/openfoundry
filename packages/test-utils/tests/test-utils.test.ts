import { describe, expect, it } from "vitest";
import { validateOntology } from "@openfoundry/ontology-schema";
import { OpenFoundryApiError, ErrorCode } from "@openfoundry/errors";
import { jwtVerify } from "jose";
import {
  createMockOntology,
  MOCK_EMPLOYEE_TYPE,
  MOCK_DEPARTMENT_TYPE,
  MOCK_PROJECT_TYPE,
  createMockEmployee,
  createMockDepartment,
  createMockObjects,
  createTestKeyPair,
  createTestToken,
  createExpiredToken,
  expectApiError,
  expectRid,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock ontology
// ---------------------------------------------------------------------------

describe("createMockOntology", () => {
  it("returns an ontology with 3 object types", () => {
    const ontology = createMockOntology();

    expect(Object.keys(ontology.objectTypes)).toHaveLength(3);
    expect(ontology.objectTypes).toHaveProperty("Employee");
    expect(ontology.objectTypes).toHaveProperty("Department");
    expect(ontology.objectTypes).toHaveProperty("Project");
  });

  it("returns an ontology that passes validation", () => {
    const ontology = createMockOntology();
    const errors = validateOntology(ontology);

    expect(errors).toEqual([]);
  });

  it("includes 2 link types and 1 action type", () => {
    const ontology = createMockOntology();

    expect(Object.keys(ontology.linkTypes)).toHaveLength(2);
    expect(Object.keys(ontology.actionTypes)).toHaveLength(1);
    expect(ontology.actionTypes).toHaveProperty("hireEmployee");
  });
});

describe("pre-built object types", () => {
  it("MOCK_EMPLOYEE_TYPE has expected properties", () => {
    expect(MOCK_EMPLOYEE_TYPE.apiName).toBe("Employee");
    expect(MOCK_EMPLOYEE_TYPE.primaryKeyApiName).toBe("employeeId");
    expect(MOCK_EMPLOYEE_TYPE.properties).toHaveProperty("fullName");
    expect(MOCK_EMPLOYEE_TYPE.properties).toHaveProperty("email");
  });
});

// ---------------------------------------------------------------------------
// Mock objects
// ---------------------------------------------------------------------------

describe("createMockEmployee", () => {
  it("creates an employee with default values", () => {
    const emp = createMockEmployee();

    expect(emp.fullName).toBe("Jane Doe");
    expect(emp.email).toBe("jane.doe@example.com");
    expect(emp.isActive).toBe(true);
    expect(emp.employeeId).toBeDefined();
  });

  it("accepts overrides", () => {
    const emp = createMockEmployee({ fullName: "Bob Smith", isActive: false });

    expect(emp.fullName).toBe("Bob Smith");
    expect(emp.isActive).toBe(false);
  });
});

describe("createMockObjects", () => {
  it("generates N Employee objects with unique IDs", () => {
    const objects = createMockObjects("Employee", 5);

    expect(objects).toHaveLength(5);
    const ids = objects.map((o) => (o as { employeeId: string }).employeeId);
    expect(new Set(ids).size).toBe(5);
  });

  it("generates objects for unknown types with generic shape", () => {
    const objects = createMockObjects("Widget", 3);

    expect(objects).toHaveLength(3);
    expect(objects[0]).toHaveProperty("id");
    expect(objects[0]).toHaveProperty("type", "Widget");
  });
});

// ---------------------------------------------------------------------------
// Mock auth
// ---------------------------------------------------------------------------

describe("createTestToken", () => {
  it("creates a valid JWT that can be verified", async () => {
    const { token, publicKey } = await createTestToken();

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: "openfoundry-test",
      audience: "openfoundry-test",
    });

    expect(payload.sub).toBe("00000000-0000-4000-a000-000000000001");
    expect(payload.scope).toBe("api:ontologies-read api:datasets-read");
  });

  it("allows claim overrides", async () => {
    const { token, publicKey } = await createTestToken({
      sub: "custom-user-id",
      svc: "custom-service",
    });

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: "openfoundry-test",
      audience: "openfoundry-test",
    });

    expect(payload.sub).toBe("custom-user-id");
    expect(payload.svc).toBe("custom-service");
  });
});

describe("createExpiredToken", () => {
  it("creates a token that fails verification due to expiration", async () => {
    const { token, publicKey } = await createExpiredToken();

    await expect(
      jwtVerify(token, publicKey, {
        issuer: "openfoundry-test",
        audience: "openfoundry-test",
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("expectApiError", () => {
  it("passes when the function throws the expected error", async () => {
    await expectApiError(
      async () => {
        throw new OpenFoundryApiError({
          errorCode: ErrorCode.NOT_FOUND,
          errorName: "TestNotFound",
          message: "Not found",
        });
      },
      404,
      "NOT_FOUND",
    );
  });

  it("fails when the function does not throw", async () => {
    await expect(
      expectApiError(async () => "ok", 404),
    ).rejects.toThrow("did not throw");
  });
});

describe("expectRid", () => {
  it("accepts a valid RID", () => {
    expect(() => expectRid("ri.ontology.main.object.abc123")).not.toThrow();
  });

  it("rejects an invalid RID", () => {
    expect(() => expectRid("not-a-rid")).toThrow("valid RID");
  });

  it("validates the service segment when provided", () => {
    expect(() =>
      expectRid("ri.ontology.main.object.abc123", "ontology"),
    ).not.toThrow();

    expect(() =>
      expectRid("ri.ontology.main.object.abc123", "auth"),
    ).toThrow('service segment to be "auth"');
  });
});
