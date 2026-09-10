import type { FastifyInstance } from "fastify";
import type {
  ObjectReadWriteStore,
  ObjectTypeSchemaSource,
} from "../../store/object-store.js";
import type { LinkStore } from "../../store/link-store.js";
import { objectRoutesV1 } from "./objects.js";

/**
 * The `/api/v1` ontology-object surface.
 *
 * Reads the same stores as the v2 routes and serves the v1 models, which are a
 * different shape rather than a different prefix: see `./serializers.ts` for
 * `OntologyObject`, and `./search-query.ts` for the filter grammar.
 */
export async function v1Routes(
  app: FastifyInstance,
  opts: {
    store: ObjectReadWriteStore;
    linkStore: LinkStore;
    objectTypeSchema?: ObjectTypeSchemaSource;
  },
): Promise<void> {
  // Rebuilt rather than passed through: `opts` still carries this plugin's own
  // `prefix`, which would otherwise be applied a second time.
  await app.register(objectRoutesV1, {
    store: opts.store,
    linkStore: opts.linkStore,
    objectTypeSchema: opts.objectTypeSchema,
  });
}
