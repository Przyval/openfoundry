import type {
  PropertyType,
  PropertyDef,
  ObjectTypeDefinition,
  ObjectTypeStatus,
} from "@openfoundry/ontology-schema";

interface PropertyOptions {
  nullable?: boolean;
  description?: string;
}

export class ObjectBuilder {
  private _displayName = "";
  private _description = "";
  private _properties: Record<string, PropertyDef> = {};
  private _primaryKey = "";
  private _primaryKeyType: PropertyType = "STRING" as PropertyType;
  private _titleProperty = "";
  private _implements: string[] = [];
  private _status: ObjectTypeStatus = "ACTIVE";

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
      description: options?.description,
    };
    return this;
  }

  primaryKey(propertyApiName: string): this {
    this._primaryKey = propertyApiName;
    return this;
  }

  titleProperty(propertyApiName: string): this {
    this._titleProperty = propertyApiName;
    return this;
  }

  implements(...interfaces: string[]): this {
    this._implements.push(...interfaces);
    return this;
  }

  status(status: ObjectTypeStatus): this {
    this._status = status;
    return this;
  }

  /** @internal */
  _build(apiName: string): ObjectTypeDefinition {
    void this._displayName; // reserved for future use
    if (!this._primaryKey) {
      throw new Error(
        `ObjectBuilder for "${apiName}": primaryKey is required`,
      );
    }
    if (!this._description) {
      throw new Error(
        `ObjectBuilder for "${apiName}": description is required`,
      );
    }
    if (Object.keys(this._properties).length === 0) {
      throw new Error(
        `ObjectBuilder for "${apiName}": at least one property is required`,
      );
    }
    if (!(this._primaryKey in this._properties)) {
      throw new Error(
        `ObjectBuilder for "${apiName}": primaryKey "${this._primaryKey}" is not defined in properties`,
      );
    }

    const pkProp = this._properties[this._primaryKey];
    this._primaryKeyType = pkProp.type;

    const titleProp = this._titleProperty || this._primaryKey;

    return {
      apiName,
      description: this._description,
      primaryKeyApiName: this._primaryKey,
      primaryKeyType: this._primaryKeyType,
      titlePropertyApiName: titleProp,
      properties: { ...this._properties },
      implements: [...this._implements],
      status: this._status,
    };
  }
}

/**
 * Define an object type using a builder DSL.
 */
export function defineObject(
  apiName: string,
  builder: (o: ObjectBuilder) => void,
): ObjectTypeDefinition {
  const b = new ObjectBuilder();
  builder(b);
  return b._build(apiName);
}
