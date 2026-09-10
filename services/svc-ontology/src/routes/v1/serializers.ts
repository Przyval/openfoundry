/**
 * Wire serializers for the v1 ontology metadata models.
 *
 * The v2 routes serve the store's own `ObjectTypeDefinition` and
 * `ActionTypeDefinition` more or less untouched. v1 declares different models -
 * `ObjectType.primaryKey` is a *list*, its properties carry a `baseType` rather
 * than a structured `dataType`, and every type carries a `rid` - so v1 is
 * projected here instead of aliased onto whatever v2 happens to emit.
 */

import { customServer, safeArg } from "@openfoundry/errors";
import type {
  ActionTypeDefinition,
  LinkTypeDefinition,
  ObjectTypeDefinition,
  PropertyDef,
} from "@openfoundry/ontology-schema";
import { generateDeterministicRid } from "@openfoundry/rid";
import type { StoredOntology } from "../../store/ontology-store.js";
import { toV1ValueType } from "./value-types.js";

/** `ontologies_models.Ontology`. */
export interface V1Ontology {
  apiName: string;
  displayName: string;
  description: string;
  rid: string;
}

/** `ontologies_models.Property`. */
export interface V1Property {
  description?: string;
  baseType: string;
}

/** `ontologies_models.ObjectType`. */
export interface V1ObjectType {
  apiName: string;
  displayName?: string;
  status: string;
  description?: string;
  primaryKey: string[];
  properties: Record<string, V1Property>;
  rid: string;
}

/** `ontologies_models.Parameter`. */
export interface V1Parameter {
  description?: string;
  baseType: string;
  required: boolean;
}

/** `ontologies_models.LogicRule`, restricted to the object-mutating variants. */
export type V1LogicRule =
  | { type: "createObject"; objectTypeApiName: string }
  | { type: "modifyObject"; objectTypeApiName: string };

/** `ontologies_models.ActionType`. */
export interface V1ActionType {
  apiName: string;
  description?: string;
  status: string;
  parameters: Record<string, V1Parameter>;
  rid: string;
  operations: V1LogicRule[];
}

/** `ontologies_models.LinkTypeSide`. */
export interface V1LinkTypeSide {
  apiName: string;
  displayName: string;
  status: string;
  objectTypeApiName: string;
  cardinality: string;
  foreignKeyPropertyApiName?: string;
}

/**
 * The RID of an ontology entity that the stores identify by api name alone.
 *
 * `ObjectType.rid` and `ActionType.rid` are required in v1, but neither
 * `OntologyStore` nor `PgOntologyStore` surfaces one: both key their entities on
 * the api name and `rowTo*` drops the `rid` column. Hashing the pair the entity
 * *is* identified by gives a value that is stable across restarts and identical
 * in both backends, which a randomly generated one would not be.
 */
function entityRid(type: string, ontologyRid: string, apiName: string): string {
  return generateDeterministicRid(
    "ontology",
    type,
    `${ontologyRid}/${apiName}`,
  ).toString();
}

/**
 * v1 `Ontology` carries exactly four fields. The v2 route additionally emits
 * `version`, which is not in either version's model.
 */
export function toV1Ontology(ontology: StoredOntology): V1Ontology {
  return {
    apiName: ontology.apiName,
    displayName: ontology.displayName,
    description: ontology.description,
    rid: ontology.rid,
  };
}

function toV1Property(def: PropertyDef): V1Property {
  return {
    ...(def.description !== undefined ? { description: def.description } : {}),
    baseType: toV1ValueType(def),
  };
}

/**
 * The primary key property name of a stored object type, under either spelling.
 *
 * The v2 create route stores the request body verbatim, so an object type
 * created over HTTP - which is every object type the demo seeders produce -
 * carries `primaryKey` where the typed `ObjectTypeDefinition` declares
 * `primaryKeyApiName`. Both are read here; an object type carrying neither has
 * no valid v1 representation, since v1 `ObjectType.primaryKey` is required, and
 * inventing a key would publish a wrong answer instead of a known failure.
 */
function primaryKeyApiNameOf(def: ObjectTypeDefinition): string {
  const stored = def.primaryKeyApiName ?? (def as { primaryKey?: unknown }).primaryKey;
  if (typeof stored !== "string" || stored === "") {
    throw customServer(
      500,
      "ObjectTypeNotRepresentableInV1",
      `The object type \`${def.apiName}\` declares no primary key, and v1 \`ObjectType.primaryKey\` is required.`,
      [safeArg("objectType", def.apiName)],
    );
  }
  return stored;
}

/**
 * `primaryKey` is a list in v1 because Foundry allows a composite key there.
 * OpenFoundry object types declare a single primary key property, so the list
 * always holds one entry - which is a conformant composite key of length one,
 * not a truncation.
 *
 * An object type stored without a `status` is served as `ACTIVE`, which is not
 * an invented value: `object_types.status` is `TEXT NOT NULL DEFAULT 'ACTIVE'`
 * in both `scripts/migrate.sql` and `db/migrations/003_phase1_tables.sql`, so
 * that is exactly what the same input carries in Postgres mode.
 *
 * `legacyObjectTypeId` and `visibility` are optional and nothing in the store
 * records them, so they are omitted rather than defaulted.
 */
export function toV1ObjectType(
  ontologyRid: string,
  def: ObjectTypeDefinition,
): V1ObjectType {
  return {
    apiName: def.apiName,
    ...(def.displayName !== undefined ? { displayName: def.displayName } : {}),
    status: def.status ?? "ACTIVE",
    ...(def.description !== "" ? { description: def.description } : {}),
    primaryKey: [primaryKeyApiNameOf(def)],
    properties: Object.fromEntries(
      Object.entries(def.properties ?? {}).map(([name, property]) => [
        name,
        toV1Property(property),
      ]),
    ),
    rid: entityRid("object-type", ontologyRid, def.apiName),
  };
}

/**
 * The action's `operations`, derived from the entities it declares it modifies.
 *
 * Required in v1 `ActionType`. An entity marked `created` yields a
 * `createObject` rule and one marked `modified` a `modifyObject` rule; both v1
 * variants are keyed by the object type alone, so neither needs the parameter
 * wiring OpenFoundry action types do not record.
 */
export function deriveV1Operations(def: ActionTypeDefinition): V1LogicRule[] {
  const operations: V1LogicRule[] = [];
  for (const [objectTypeApiName, entity] of Object.entries(
    def.modifiedEntities ?? {},
  )) {
    if (entity?.created) {
      operations.push({ type: "createObject", objectTypeApiName });
    }
    if (entity?.modified) {
      operations.push({ type: "modifyObject", objectTypeApiName });
    }
  }
  return operations;
}

/**
 * `Parameter.dataType` is optional in v1 and is omitted: it is the structured
 * `OntologyDataType`, which an `ActionParameter`'s bare `PropertyType` tag
 * cannot be turned into without inventing the parts it does not carry.
 * `baseType` is required and is served.
 */
export function toV1ActionType(
  ontologyRid: string,
  def: ActionTypeDefinition,
): V1ActionType {
  return {
    apiName: def.apiName,
    ...(def.description !== "" ? { description: def.description } : {}),
    status: def.status,
    parameters: Object.fromEntries(
      Object.entries(def.parameters ?? {}).map(([id, parameter]) => [
        id,
        {
          ...(parameter.description !== undefined
            ? { description: parameter.description }
            : {}),
          baseType: toV1ValueType({
            type: parameter.type,
            nullable: !parameter.required,
            multiplicity: "SINGLE",
          }),
          required: parameter.required,
        },
      ]),
    ),
    rid: entityRid("action-type", ontologyRid, def.apiName),
    operations: deriveV1Operations(def),
  };
}

/**
 * A link side describes the *far* end of the link, so `objectTypeApiName` is
 * the linked object type rather than the one being queried. v1 `LinkTypeSide`
 * is the v2 model minus `linkTypeRid`, which the store does not record.
 */
export function toV1LinkTypeSide(link: LinkTypeDefinition): V1LinkTypeSide {
  return {
    apiName: link.apiName,
    displayName: link.apiName,
    status: "ACTIVE",
    objectTypeApiName: link.linkedObjectTypeApiName,
    cardinality: link.cardinality,
    ...(link.foreignKeyPropertyApiName
      ? { foreignKeyPropertyApiName: link.foreignKeyPropertyApiName }
      : {}),
  };
}
