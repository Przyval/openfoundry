import type { FastifyInstance } from "fastify";
import type { OntologyStore } from "../../store/ontology-store.js";
import { ontologyRoutesV1 } from "./ontologies.js";

/**
 * The `/api/v1` ontology-metadata surface.
 *
 * Reads the same store as the v2 routes but serves the v1 models, which differ
 * in more than their prefix: `ObjectType.primaryKey` is a list, properties
 * carry a `baseType` string, and `GET /ontologies` does not paginate.
 */
export async function v1Routes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  await app.register(ontologyRoutesV1, { store: opts.store });
}
