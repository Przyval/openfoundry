import type { FastifyInstance } from "fastify";
import type { OntologyStore } from "../../store/ontology-store.js";
import { ontologyRoutes } from "./ontologies.js";
import { objectTypeRoutes } from "./object-types.js";
import { actionTypeRoutes } from "./action-types.js";
import { linkTypeRoutes } from "./link-types.js";
import { interfaceTypeRoutes } from "./interface-types.js";
import { sharedPropertyTypeRoutes } from "./shared-property-types.js";
import { queryTypeRoutes } from "./query-types.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const routeOpts = { store: opts.store };

  await app.register(ontologyRoutes, routeOpts);
  await app.register(objectTypeRoutes, routeOpts);
  await app.register(actionTypeRoutes, routeOpts);
  await app.register(linkTypeRoutes, routeOpts);
  await app.register(interfaceTypeRoutes, routeOpts);
  await app.register(sharedPropertyTypeRoutes, routeOpts);
  await app.register(queryTypeRoutes, routeOpts);
}
