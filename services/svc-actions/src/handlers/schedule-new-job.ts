// ---------------------------------------------------------------------------
// Action handler: ScheduleNewJob
//
// Creates a new ServiceJob with status "scheduled", increments the
// technician's activeJobCount, and creates a Schedule entry.
// ---------------------------------------------------------------------------

import type { ObjectsClient } from "../objects-client.js";
import type { ActionHandler } from "../store/action-registry.js";

let jobCounter = 100;
let scheduleCounter = 100;

export function createScheduleNewJobHandler(
  clientFactory: (ontologyRid: string) => ObjectsClient,
): ActionHandler {
  return async (params, context) => {
    const {
      customerId,
      technicianId,
      serviceType,
      pestType,
      scheduledDate,
      priority,
      address,
    } = params as {
      customerId: string;
      technicianId: string;
      serviceType: string;
      pestType: string;
      scheduledDate: string;
      priority: string;
      address: string;
    };

    const client = clientFactory(context.ontologyRid);
    const modifiedObjects: Record<string, unknown>[] = [];

    // Generate IDs
    const year = new Date().getFullYear();
    jobCounter++;
    scheduleCounter++;
    const jobId = `JOB-${year}-${String(jobCounter).padStart(3, "0")}`;
    const scheduleId = `SCH-${year}-${String(scheduleCounter).padStart(3, "0")}`;

    // 1. Create the ServiceJob
    const job = await client.createObject("ServiceJob", jobId, {
      jobId,
      customerId,
      technicianId,
      serviceType,
      pestType,
      scheduledDate,
      completedDate: "",
      status: "scheduled",
      priority,
      address,
      treatmentUsed: "",
      amountCharged: 0,
      technicianNotes: "",
      customerRating: 0,
      followUpRequired: "no",
    });
    modifiedObjects.push(job);

    // 2. Increment technician's activeJobCount
    const tech = await client.getObject("Technician", technicianId);
    const currentCount = (tech.properties.activeJobCount as number) || 0;
    const updatedTech = await client.updateObject("Technician", technicianId, {
      activeJobCount: currentCount + 1,
    });
    modifiedObjects.push(updatedTech);

    // 3. Create Schedule entry
    const schedule = await client.createObject("Schedule", scheduleId, {
      scheduleId,
      customerId,
      technicianId,
      vehicleId: "",
      date: scheduledDate,
      timeSlot: "08:00-10:00",
      jobId,
      serviceType,
      status: "confirmed",
      notes: `Auto-created for ${serviceType} job`,
    });
    modifiedObjects.push(schedule);

    return {
      result: {
        modifiedObjects,
        summary: {
          jobId,
          scheduleId,
          technicianId,
          newActiveJobCount: currentCount + 1,
          scheduledDate,
        },
      },
    };
  };
}
