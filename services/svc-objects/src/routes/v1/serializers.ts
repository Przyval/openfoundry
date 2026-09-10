/**
 * Wire serializers for the v1 ontology object models.
 *
 * This is the sharpest divergence between the two versions. v1's
 * `OntologyObject` is `{ properties, rid }` - a nested envelope - while v2's
 * `OntologyObjectV2` is a bare `Dict[PropertyApiName, PropertyValue]` with the
 * identifiers folded in as `__` keys. A client generated against v1 reading a
 * v2 response finds no `properties` key at all, so aliasing the v2 routes onto
 * `/api/v1` would serve every object in a shape v1 cannot parse.
 */

import type { StoredObject } from "../../store/object-store.js";

/** `ontologies_models.OntologyObject`. */
export interface V1OntologyObject {
  properties: Record<string, unknown>;
  rid: string;
}

/**
 * The store's `objectType`, `primaryKey`, `createdAt` and `updatedAt` are
 * OpenFoundry bookkeeping with no place in the v1 model, so they are dropped
 * rather than emitted alongside it.
 */
export function toV1OntologyObject(object: StoredObject): V1OntologyObject {
  return { properties: object.properties, rid: object.rid };
}

/** `ontologies_models.AggregationMetricResult`. */
export interface V1AggregationMetricResult {
  name: string;
  value?: number;
}

/** `ontologies_models.AggregateObjectsResponseItem`. */
export interface V1AggregateObjectsResponseItem {
  group: Record<string, unknown>;
  metrics: V1AggregationMetricResult[];
}
