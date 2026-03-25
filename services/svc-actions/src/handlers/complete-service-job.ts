// ---------------------------------------------------------------------------
// Action handler: CompleteServiceJob
//
// Marks a service job as completed, optionally deducts product stock,
// decrements the technician's active job count, and creates an invoice
// with 11% tax.
// ---------------------------------------------------------------------------

import type { ObjectsClient } from "../objects-client.js";
import type { ActionHandler } from "../store/action-registry.js";

export function createCompleteServiceJobHandler(
  clientFactory: (ontologyRid: string) => ObjectsClient,
): ActionHandler {
  return async (params, context) => {
    const {
      jobId,
      treatmentUsed,
      technicianNotes,
      customerRating,
      productId,
      quantityUsed,
    } = params as {
      jobId: string;
      treatmentUsed: string;
      technicianNotes: string;
      customerRating: number;
      productId?: string;
      quantityUsed?: number;
    };

    const client = clientFactory(context.ontologyRid);
    const modifiedObjects: Record<string, unknown>[] = [];

    // 1. Fetch the current job to get its technicianId and amountCharged
    const job = await client.getObject("ServiceJob", jobId);
    const technicianId = job.properties.technicianId as string;
    const customerId = job.properties.customerId as string;
    const amountCharged = (job.properties.amountCharged as number) || 0;

    const today = new Date().toISOString().slice(0, 10);

    // 2. Update the ServiceJob
    const updatedJob = await client.updateObject("ServiceJob", jobId, {
      status: "completed",
      completedDate: today,
      treatmentUsed,
      technicianNotes,
      customerRating,
    });
    modifiedObjects.push(updatedJob);

    // 3. If productId given, deduct stock
    if (productId && quantityUsed && quantityUsed > 0) {
      const product = await client.getObject("TreatmentProduct", productId);
      const currentStock = (product.properties.stockQty as number) || 0;
      const newStock = Math.max(0, currentStock - quantityUsed);

      const updatedProduct = await client.updateObject(
        "TreatmentProduct",
        productId,
        { stockQty: newStock },
      );
      modifiedObjects.push(updatedProduct);
    }

    // 4. Decrement technician's activeJobCount
    const tech = await client.getObject("Technician", technicianId);
    const currentCount = (tech.properties.activeJobCount as number) || 0;
    const updatedTech = await client.updateObject("Technician", technicianId, {
      activeJobCount: Math.max(0, currentCount - 1),
    });
    modifiedObjects.push(updatedTech);

    // 5. Create invoice with 11% tax
    const tax = Math.round(amountCharged * 0.11);
    const totalAmount = amountCharged + tax;
    const invoiceId = `INV-${jobId.replace("JOB-", "")}`;
    const dueDate = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    const invoice = await client.createObject("Invoice", invoiceId, {
      invoiceId,
      customerId,
      jobId,
      invoiceDate: today,
      dueDate,
      amount: amountCharged,
      tax,
      totalAmount,
      status: "draft",
      paymentMethod: "",
      paidDate: "",
      notes: `Auto-generated on job completion`,
    });
    modifiedObjects.push(invoice);

    return {
      result: {
        modifiedObjects,
        summary: {
          jobId,
          invoiceId,
          totalAmount,
          technicianId,
          newActiveJobCount: Math.max(0, currentCount - 1),
        },
      },
    };
  };
}
