import type {
  PropertyType,
  PropertyDef,
  InterfaceTypeDefinition,
} from "@openfoundry/ontology-schema";

interface PropertyOptions {
  nullable?: boolean;
}

export class InterfaceBuilder {
  private _displayName = "";
  private _description = "";
  private _properties: Record<string, PropertyDef> = {};
  private _extendsInterfaces: string[] = [];

  displayName(name: string): this {
    this._displayName = name;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  property(
    apiName: string,
    type: PropertyType,
    options?: PropertyOptions,
  ): this {
    this._properties[apiName] = {
      type,
      nullable: options?.nullable ?? false,
      multiplicity: "SINGLE",
    };
    return this;
  }

  extends(...interfaces: string[]): this {
    this._extendsInterfaces.push(...interfaces);
    return this;
  }

  /** @internal */
  _build(apiName: string): InterfaceTypeDefinition {
    void this._displayName; // reserved for future use
    if (!this._description) {
      throw new Error(
        `InterfaceBuilder for "${apiName}": description is required`,
      );
    }

    return {
      apiName,
      description: this._description,
      properties: { ...this._properties },
      extendsInterfaces: [...this._extendsInterfaces],
    };
  }
}

/**
 * Define an interface type using a builder DSL.
 */
export function defineInterface(
  apiName: string,
  builder: (i: InterfaceBuilder) => void,
): InterfaceTypeDefinition {
  const b = new InterfaceBuilder();
  builder(b);
  return b._build(apiName);
}
