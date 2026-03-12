import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParameterDef {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface StoredFunction {
  rid: string;
  apiName: string;
  displayName: string;
  description: string;
  version: number;
  runtime: "TYPESCRIPT";
  code: string;
  parameters: ParameterDef[];
  returnType: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface CreateFunctionInput {
  apiName: string;
  displayName: string;
  description: string;
  code: string;
  parameters?: ParameterDef[];
  returnType?: string;
}

export interface UpdateFunctionInput {
  displayName?: string;
  description?: string;
  code?: string;
  parameters?: ParameterDef[];
  returnType?: string;
  status?: "ACTIVE" | "DISABLED";
}

// ---------------------------------------------------------------------------
// FunctionStore — in-memory storage for user-defined functions
// ---------------------------------------------------------------------------

export class FunctionStore {
  private readonly functions = new Map<string, StoredFunction>();

  registerFunction(input: CreateFunctionInput): StoredFunction {
    // Check for duplicate apiName
    for (const fn of this.functions.values()) {
      if (fn.apiName === input.apiName) {
        throw conflict("Function", `apiName "${input.apiName}" already exists`);
      }
    }

    const now = new Date().toISOString();
    const rid = generateRid("functions", "function").toString();
    const fn: StoredFunction = {
      rid,
      apiName: input.apiName,
      displayName: input.displayName,
      description: input.description,
      version: 1,
      runtime: "TYPESCRIPT",
      code: input.code,
      parameters: input.parameters ?? [],
      returnType: input.returnType ?? "unknown",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    this.functions.set(rid, fn);
    return fn;
  }

  getFunction(rid: string): StoredFunction {
    const fn = this.functions.get(rid);
    if (!fn) {
      throw notFound("Function", rid);
    }
    return fn;
  }

  getFunctionByName(apiName: string): StoredFunction {
    for (const fn of this.functions.values()) {
      if (fn.apiName === apiName) {
        return fn;
      }
    }
    throw notFound("Function", apiName);
  }

  listFunctions(): StoredFunction[] {
    return Array.from(this.functions.values());
  }

  updateFunction(rid: string, input: UpdateFunctionInput): StoredFunction {
    const fn = this.getFunction(rid);
    const updated: StoredFunction = {
      ...fn,
      displayName: input.displayName ?? fn.displayName,
      description: input.description ?? fn.description,
      code: input.code ?? fn.code,
      parameters: input.parameters ?? fn.parameters,
      returnType: input.returnType ?? fn.returnType,
      status: input.status ?? fn.status,
      version: fn.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.functions.set(rid, updated);
    return updated;
  }

  deleteFunction(rid: string): void {
    if (!this.functions.has(rid)) {
      throw notFound("Function", rid);
    }
    this.functions.delete(rid);
  }
}
