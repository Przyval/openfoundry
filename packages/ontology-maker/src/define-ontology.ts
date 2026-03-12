import type { OntologyDefinition } from "@openfoundry/ontology-schema";
import { ObjectBuilder, defineObject } from "./define-object.js";
import { ActionBuilder, defineAction } from "./define-action.js";
import { LinkBuilder, defineLink } from "./define-link.js";
import { InterfaceBuilder, defineInterface } from "./define-interface.js";

export class OntologyBuilder {
  private _displayName = "";
  private _description = "";
  private _objectTypes: Record<string, ReturnType<typeof defineObject>> = {};
  private _actionTypes: Record<string, ReturnType<typeof defineAction>> = {};
  private _linkTypes: Record<string, ReturnType<typeof defineLink>> = {};
  private _interfaceTypes: Record<string, ReturnType<typeof defineInterface>> =
    {};

  displayName(name: string): this {
    this._displayName = name;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  object(apiName: string, builder: (o: ObjectBuilder) => void): this {
    this._objectTypes[apiName] = defineObject(apiName, builder);
    return this;
  }

  action(apiName: string, builder: (a: ActionBuilder) => void): this {
    this._actionTypes[apiName] = defineAction(apiName, builder);
    return this;
  }

  link(apiName: string, builder: (l: LinkBuilder) => void): this {
    this._linkTypes[apiName] = defineLink(apiName, builder);
    return this;
  }

  interface(apiName: string, builder: (i: InterfaceBuilder) => void): this {
    this._interfaceTypes[apiName] = defineInterface(apiName, builder);
    return this;
  }

  /** @internal */
  _build(apiName: string): OntologyDefinition {
    if (!this._description) {
      throw new Error(
        `OntologyBuilder for "${apiName}": description is required`,
      );
    }

    return {
      rid: `ri.ontology.main.ontology.${apiName}`,
      apiName,
      displayName: this._displayName || apiName,
      description: this._description,
      objectTypes: { ...this._objectTypes },
      actionTypes: { ...this._actionTypes },
      linkTypes: { ...this._linkTypes },
      interfaceTypes: { ...this._interfaceTypes },
      queryTypes: {},
    };
  }
}

/**
 * Define a full ontology using a builder DSL.
 */
export function defineOntology(
  apiName: string,
  builder: (ont: OntologyBuilder) => void,
): OntologyDefinition {
  const b = new OntologyBuilder();
  builder(b);
  return b._build(apiName);
}
