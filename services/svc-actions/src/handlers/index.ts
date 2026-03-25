// ---------------------------------------------------------------------------
// Pest Control business action definitions & handler registration.
//
// This module defines the 4 business actions and attaches their handlers
// to the ActionRegistry so that POST .../apply invocations execute real
// multi-object workflows against svc-objects.
// ---------------------------------------------------------------------------

import { PropertyType } from "@openfoundry/ontology-schema";
import type { ActionRegistry } from "../store/action-registry.js";
import type { PgActionRegistry } from "../store/pg-action-registry.js";
import { ObjectsClient } from "../objects-client.js";
import { createCompleteServiceJobHandler } from "./complete-service-job.js";
import { createScheduleNewJobHandler } from "./schedule-new-job.js";
import { createAssignTechnicianHandler } from "./assign-technician.js";
import { createReorderProductHandler } from "./reorder-product.js";

/**
 * Registers all 4 business action types into the registry and attaches
 * their execution handlers.
 */
export async function registerPestControlActions(
  registry: ActionRegistry | PgActionRegistry,
  objectsServiceUrl: string,
): Promise<void> {
  // Factory that creates a per-ontology ObjectsClient
  const clientFactory = (ontologyRid: string) =>
    new ObjectsClient(objectsServiceUrl, ontologyRid);

  // -------------------------------------------------------------------------
  // 1. CompleteServiceJob
  // -------------------------------------------------------------------------
  await registry.registerAction({
    apiName: "complete-service-job",
    displayName: "Complete Service Job",
    parameters: new Map([
      ["jobId", { type: PropertyType.STRING, required: true, description: "The service job ID to complete" }],
      ["treatmentUsed", { type: PropertyType.STRING, required: true, description: "Treatment method used" }],
      ["technicianNotes", { type: PropertyType.STRING, required: true, description: "Technician observations and notes" }],
      ["customerRating", { type: PropertyType.INTEGER, required: true, description: "Customer satisfaction rating (1-5)" }],
      ["productId", { type: PropertyType.STRING, required: false, description: "Product used (for stock deduction)" }],
      ["quantityUsed", { type: PropertyType.INTEGER, required: false, description: "Quantity of product used" }],
    ]),
    modifiedEntities: {
      ServiceJob: { created: false, modified: true },
      TreatmentProduct: { created: false, modified: true },
      Technician: { created: false, modified: true },
      Invoice: { created: true, modified: false },
    },
    status: "ACTIVE",
    handler: createCompleteServiceJobHandler(clientFactory),
  });

  // -------------------------------------------------------------------------
  // 2. ScheduleNewJob
  // -------------------------------------------------------------------------
  await registry.registerAction({
    apiName: "schedule-new-job",
    displayName: "Schedule New Job",
    parameters: new Map([
      ["customerId", { type: PropertyType.STRING, required: true, description: "Customer ID" }],
      ["technicianId", { type: PropertyType.STRING, required: true, description: "Technician to assign" }],
      ["serviceType", { type: PropertyType.STRING, required: true, description: "Service type (treatment/inspection/emergency/follow-up)" }],
      ["pestType", { type: PropertyType.STRING, required: true, description: "Target pest type" }],
      ["scheduledDate", { type: PropertyType.STRING, required: true, description: "Scheduled date (YYYY-MM-DD)" }],
      ["priority", { type: PropertyType.STRING, required: true, description: "Priority (normal/high/emergency)" }],
      ["address", { type: PropertyType.STRING, required: true, description: "Service address" }],
    ]),
    modifiedEntities: {
      ServiceJob: { created: true, modified: false },
      Technician: { created: false, modified: true },
      Schedule: { created: true, modified: false },
    },
    status: "ACTIVE",
    handler: createScheduleNewJobHandler(clientFactory),
  });

  // -------------------------------------------------------------------------
  // 3. AssignTechnician
  // -------------------------------------------------------------------------
  await registry.registerAction({
    apiName: "assign-technician",
    displayName: "Assign Technician",
    parameters: new Map([
      ["jobId", { type: PropertyType.STRING, required: true, description: "The service job to reassign" }],
      ["technicianId", { type: PropertyType.STRING, required: true, description: "New technician ID" }],
      ["vehicleId", { type: PropertyType.STRING, required: false, description: "Vehicle to assign to the technician" }],
    ]),
    modifiedEntities: {
      ServiceJob: { created: false, modified: true },
      Technician: { created: false, modified: true },
      Vehicle: { created: false, modified: true },
    },
    status: "ACTIVE",
    handler: createAssignTechnicianHandler(clientFactory),
  });

  // -------------------------------------------------------------------------
  // 4. ReorderProduct
  // -------------------------------------------------------------------------
  await registry.registerAction({
    apiName: "reorder-product",
    displayName: "Reorder Product",
    parameters: new Map([
      ["productId", { type: PropertyType.STRING, required: true, description: "Product ID to reorder" }],
      ["quantity", { type: PropertyType.INTEGER, required: true, description: "Quantity to add to stock" }],
      ["supplier", { type: PropertyType.STRING, required: false, description: "Override supplier name" }],
    ]),
    modifiedEntities: {
      TreatmentProduct: { created: false, modified: true },
    },
    status: "ACTIVE",
    handler: createReorderProductHandler(clientFactory),
  });
}
