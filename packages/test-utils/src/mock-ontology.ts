import type {
  OntologyDefinition,
  ObjectTypeDefinition,
  LinkTypeDefinition,
  ActionTypeDefinition,
} from "@openfoundry/ontology-schema";

// ---------------------------------------------------------------------------
// Pre-built object type definitions
// ---------------------------------------------------------------------------

/**
 * Mock Employee object type with standard HR properties.
 */
export const MOCK_EMPLOYEE_TYPE: ObjectTypeDefinition = {
  apiName: "Employee",
  description: "An employee in the organization",
  primaryKeyApiName: "employeeId",
  primaryKeyType: "STRING",
  titlePropertyApiName: "fullName",
  properties: {
    employeeId: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Unique employee identifier",
    },
    fullName: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Full name of the employee",
    },
    email: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Email address",
    },
    startDate: {
      type: "TIMESTAMP",
      nullable: true,
      multiplicity: "SINGLE",
      description: "Employment start date",
    },
    isActive: {
      type: "BOOLEAN",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Whether the employee is currently active",
    },
    departmentId: {
      type: "STRING",
      nullable: true,
      multiplicity: "SINGLE",
      description: "Foreign key to Department",
    },
  },
  implements: [],
  status: "ACTIVE",
};

/**
 * Mock Department object type.
 */
export const MOCK_DEPARTMENT_TYPE: ObjectTypeDefinition = {
  apiName: "Department",
  description: "An organizational department",
  primaryKeyApiName: "departmentId",
  primaryKeyType: "STRING",
  titlePropertyApiName: "name",
  properties: {
    departmentId: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Unique department identifier",
    },
    name: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Department name",
    },
    budget: {
      type: "DOUBLE",
      nullable: true,
      multiplicity: "SINGLE",
      description: "Annual budget",
    },
  },
  implements: [],
  status: "ACTIVE",
};

/**
 * Mock Project object type.
 */
export const MOCK_PROJECT_TYPE: ObjectTypeDefinition = {
  apiName: "Project",
  description: "A project within the organization",
  primaryKeyApiName: "projectId",
  primaryKeyType: "STRING",
  titlePropertyApiName: "title",
  properties: {
    projectId: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Unique project identifier",
    },
    title: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Project title",
    },
    description: {
      type: "STRING",
      nullable: true,
      multiplicity: "SINGLE",
      description: "Project description",
    },
    status: {
      type: "STRING",
      nullable: false,
      multiplicity: "SINGLE",
      description: "Current project status",
    },
    startDate: {
      type: "TIMESTAMP",
      nullable: true,
      multiplicity: "SINGLE",
      description: "Project start date",
    },
  },
  implements: [],
  status: "ACTIVE",
};

// ---------------------------------------------------------------------------
// Mock link types
// ---------------------------------------------------------------------------

const MOCK_EMPLOYEE_DEPARTMENT_LINK: LinkTypeDefinition = {
  apiName: "employeeDepartment",
  objectTypeApiName: "Employee",
  linkedObjectTypeApiName: "Department",
  cardinality: "MANY",
  foreignKeyPropertyApiName: "departmentId",
};

const MOCK_EMPLOYEE_PROJECT_LINK: LinkTypeDefinition = {
  apiName: "employeeProject",
  objectTypeApiName: "Project",
  linkedObjectTypeApiName: "Employee",
  cardinality: "MANY",
  foreignKeyPropertyApiName: "projectId",
};

// ---------------------------------------------------------------------------
// Mock action type
// ---------------------------------------------------------------------------

const MOCK_HIRE_EMPLOYEE_ACTION: ActionTypeDefinition = {
  apiName: "hireEmployee",
  description: "Creates a new employee and assigns them to a department",
  parameters: {
    fullName: {
      type: "STRING",
      required: true,
      description: "Full name of the new hire",
    },
    email: {
      type: "STRING",
      required: true,
      description: "Email address",
    },
    departmentId: {
      type: "STRING",
      required: true,
      description: "Department to assign the employee to",
    },
  },
  modifiedEntities: {
    Employee: { created: true, modified: false },
  },
  status: "ACTIVE",
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a complete mock OntologyDefinition with 3 object types
 * (Employee, Department, Project), 2 link types, and 1 action type.
 *
 * The returned ontology passes `validateOntology()` with no errors.
 */
export function createMockOntology(): OntologyDefinition {
  return {
    rid: "ri.ontology.main.ontology.mock-ontology-001",
    apiName: "MockOntology",
    displayName: "Mock Ontology",
    description: "A mock ontology for testing purposes",
    objectTypes: {
      Employee: MOCK_EMPLOYEE_TYPE,
      Department: MOCK_DEPARTMENT_TYPE,
      Project: MOCK_PROJECT_TYPE,
    },
    actionTypes: {
      hireEmployee: MOCK_HIRE_EMPLOYEE_ACTION,
    },
    linkTypes: {
      employeeDepartment: MOCK_EMPLOYEE_DEPARTMENT_LINK,
      employeeProject: MOCK_EMPLOYEE_PROJECT_LINK,
    },
    interfaceTypes: {},
    queryTypes: {},
  };
}
