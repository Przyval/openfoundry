// ---------------------------------------------------------------------------
// Action handler: AssignTechnician
//
// Reassigns a service job to a new technician (and optionally vehicle).
// Adjusts activeJobCount on both old and new technicians.
// ---------------------------------------------------------------------------

import type { ObjectsClient } from "../objects-client.js";
import type { ActionHandler } from "../store/action-registry.js";

export function createAssignTechnicianHandler(
  clientFactory: (ontologyRid: string) => ObjectsClient,
): ActionHandler {
  return async (params, context) => {
    const { jobId, technicianId, vehicleId } = params as {
      jobId: string;
      technicianId: string;
      vehicleId?: string;
    };

    const client = clientFactory(context.ontologyRid);
    const modifiedObjects: Record<string, unknown>[] = [];

    // 1. Fetch the current job to get the previous technician
    const job = await client.getObject("ServiceJob", jobId);
    const previousTechnicianId = job.properties.technicianId as string;

    // 2. Update the ServiceJob with the new technician
    const jobUpdate: Record<string, unknown> = { technicianId };
    const updatedJob = await client.updateObject("ServiceJob", jobId, jobUpdate);
    modifiedObjects.push(updatedJob);

    // 3. If the technician changed, adjust activeJobCounts
    if (previousTechnicianId && previousTechnicianId !== technicianId) {
      // Decrement old technician
      const oldTech = await client.getObject("Technician", previousTechnicianId);
      const oldCount = (oldTech.properties.activeJobCount as number) || 0;
      const updatedOldTech = await client.updateObject(
        "Technician",
        previousTechnicianId,
        { activeJobCount: Math.max(0, oldCount - 1) },
      );
      modifiedObjects.push(updatedOldTech);
    }

    // Increment new technician
    const newTech = await client.getObject("Technician", technicianId);
    const newCount = (newTech.properties.activeJobCount as number) || 0;
    const updatedNewTech = await client.updateObject(
      "Technician",
      technicianId,
      { activeJobCount: newCount + 1 },
    );
    modifiedObjects.push(updatedNewTech);

    // 4. If vehicleId provided, update vehicle assignment
    if (vehicleId) {
      const updatedVehicle = await client.updateObject("Vehicle", vehicleId, {
        assignedTechnicianId: technicianId,
      });
      modifiedObjects.push(updatedVehicle);
    }

    return {
      result: {
        modifiedObjects,
        summary: {
          jobId,
          previousTechnicianId,
          newTechnicianId: technicianId,
          vehicleId: vehicleId ?? null,
        },
      },
    };
  };
}
