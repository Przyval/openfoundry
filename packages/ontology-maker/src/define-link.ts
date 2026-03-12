import type {
  LinkTypeDefinition,
  LinkCardinality,
} from "@openfoundry/ontology-schema";

export class LinkBuilder {
  private _displayName = "";
  private _from = "";
  private _to = "";
  private _cardinality: LinkCardinality = "MANY";
  private _description = "";
  private _foreignKey = "";

  displayName(name: string): this {
    this._displayName = name;
    return this;
  }

  from(objectType: string): this {
    this._from = objectType;
    return this;
  }

  to(objectType: string): this {
    this._to = objectType;
    return this;
  }

  cardinality(c: "ONE" | "MANY"): this {
    this._cardinality = c;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  foreignKey(propertyApiName: string): this {
    this._foreignKey = propertyApiName;
    return this;
  }

  /** @internal */
  _build(apiName: string): LinkTypeDefinition {
    void this._displayName; // reserved for future use
    void this._description; // reserved for future use
    if (!this._from) {
      throw new Error(
        `LinkBuilder for "${apiName}": from (objectType) is required`,
      );
    }
    if (!this._to) {
      throw new Error(
        `LinkBuilder for "${apiName}": to (objectType) is required`,
      );
    }

    const foreignKey = this._foreignKey || `${this._to}Id`;

    return {
      apiName,
      objectTypeApiName: this._from,
      linkedObjectTypeApiName: this._to,
      cardinality: this._cardinality,
      foreignKeyPropertyApiName: foreignKey,
    };
  }
}

/**
 * Define a link type using a builder DSL.
 */
export function defineLink(
  apiName: string,
  builder: (l: LinkBuilder) => void,
): LinkTypeDefinition {
  const b = new LinkBuilder();
  builder(b);
  return b._build(apiName);
}
