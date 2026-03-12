/**
 * Mock object factories for testing.
 *
 * These create plain JS objects matching the shape of ontology object
 * instances, with sensible defaults that can be overridden.
 */

export interface MockEmployee {
  readonly employeeId: string;
  readonly fullName: string;
  readonly email: string;
  readonly startDate: string | null;
  readonly isActive: boolean;
  readonly departmentId: string | null;
}

export interface MockDepartment {
  readonly departmentId: string;
  readonly name: string;
  readonly budget: number | null;
}

/**
 * Creates a mock Employee object with sensible defaults.
 *
 * @param overrides - Optional partial overrides for any field.
 */
export function createMockEmployee(
  overrides: Partial<MockEmployee> = {},
): MockEmployee {
  const id = overrides.employeeId ?? `emp-${randomSuffix()}`;
  return {
    employeeId: id,
    fullName: "Jane Doe",
    email: "jane.doe@example.com",
    startDate: "2024-01-15T00:00:00.000Z",
    isActive: true,
    departmentId: "dept-001",
    ...overrides,
  };
}

/**
 * Creates a mock Department object with sensible defaults.
 *
 * @param overrides - Optional partial overrides for any field.
 */
export function createMockDepartment(
  overrides: Partial<MockDepartment> = {},
): MockDepartment {
  const id = overrides.departmentId ?? `dept-${randomSuffix()}`;
  return {
    departmentId: id,
    name: "Engineering",
    budget: 1_000_000,
    ...overrides,
  };
}

/**
 * Generates N mock objects of the given type.
 *
 * Supported types: "Employee", "Department".
 * Each generated object has a unique ID.
 *
 * @param type  - The object type name.
 * @param count - Number of objects to generate.
 */
export function createMockObjects(
  type: string,
  count: number,
): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    switch (type) {
      case "Employee":
        objects.push(
          createMockEmployee({
            employeeId: `emp-${String(i + 1).padStart(4, "0")}`,
            fullName: `Employee ${i + 1}`,
            email: `employee-${i + 1}@example.com`,
          }) as unknown as Record<string, unknown>,
        );
        break;
      case "Department":
        objects.push(
          createMockDepartment({
            departmentId: `dept-${String(i + 1).padStart(4, "0")}`,
            name: `Department ${i + 1}`,
          }) as unknown as Record<string, unknown>,
        );
        break;
      default:
        objects.push({ id: `${type.toLowerCase()}-${String(i + 1).padStart(4, "0")}`, type });
        break;
    }
  }

  return objects;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
