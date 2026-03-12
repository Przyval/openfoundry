import type {
  PropertyType,
  ActionTypeDefinition,
  ActionParameter,
  ModifiedEntity,
  ActionTypeStatus,
} from "@openfoundry/ontology-schema";

interface ParameterOptions {
  required?: boolean;
  description?: string;
}

export class ActionBuilder {
  private _displayName = "";
  private _description = "";
  private _parameters: Record<string, ActionParameter> = {};
  private _modifiedEntities: Record<string, ModifiedEntity> = {};
  private _status: ActionTypeStatus = "ACTIVE";

  displayName(name: string): this {
    this._displayName = name;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  parameter(
    apiName: string,
    type: PropertyType,
    options?: ParameterOptions,
  ): this {
    this._parameters[apiName] = {
      type,
      required: options?.required ?? true,
      description: options?.description,
    };
    return this;
  }

  modifies(
    objectType: string,
    modification: "CREATED" | "MODIFIED" | "DELETED",
  ): this {
    const existing = this._modifiedEntities[objectType] ?? {
      created: false,
      modified: false,
    };
    if (modification === "CREATED") {
      this._modifiedEntities[objectType] = { ...existing, created: true };
    } else if (modification === "MODIFIED") {
      this._modifiedEntities[objectType] = { ...existing, modified: true };
    } else if (modification === "DELETED") {
      // Schema ModifiedEntity only has created/modified booleans,
      // so we map DELETED to modified: true for compatibility
      this._modifiedEntities[objectType] = { ...existing, modified: true };
    }
    return this;
  }

  status(status: ActionTypeStatus): this {
    this._status = status;
    return this;
  }

  /** @internal */
  _build(apiName: string): ActionTypeDefinition {
    void this._displayName; // reserved for future use
    if (!this._description) {
      throw new Error(
        `ActionBuilder for "${apiName}": description is required`,
      );
    }

    return {
      apiName,
      description: this._description,
      parameters: { ...this._parameters },
      modifiedEntities: { ...this._modifiedEntities },
      status: this._status,
    };
  }
}

/**
 * Define an action type using a builder DSL.
 */
export function defineAction(
  apiName: string,
  builder: (a: ActionBuilder) => void,
): ActionTypeDefinition {
  const b = new ActionBuilder();
  builder(b);
  return b._build(apiName);
}
