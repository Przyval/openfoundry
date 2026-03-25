// ---------------------------------------------------------------------------
// Action handler: ReorderProduct
//
// Increases a TreatmentProduct's stockQty by the given quantity and
// records the reorder details in the product notes.
// ---------------------------------------------------------------------------

import type { ObjectsClient } from "../objects-client.js";
import type { ActionHandler } from "../store/action-registry.js";

export function createReorderProductHandler(
  clientFactory: (ontologyRid: string) => ObjectsClient,
): ActionHandler {
  return async (params, context) => {
    const { productId, quantity, supplier } = params as {
      productId: string;
      quantity: number;
      supplier?: string;
    };

    const client = clientFactory(context.ontologyRid);

    // 1. Fetch current product
    const product = await client.getObject("TreatmentProduct", productId);
    const currentStock = (product.properties.stockQty as number) || 0;
    const newStock = currentStock + quantity;

    const reorderDate = new Date().toISOString().slice(0, 10);
    const supplierName =
      supplier || (product.properties.supplier as string) || "default supplier";

    // 2. Update stockQty and add a reorder note via the supplier field update
    const updatedProduct = await client.updateObject(
      "TreatmentProduct",
      productId,
      {
        stockQty: newStock,
        supplier: supplierName,
      },
    );

    return {
      result: {
        modifiedObjects: [updatedProduct],
        summary: {
          productId,
          productName: product.properties.name,
          previousStock: currentStock,
          quantityOrdered: quantity,
          newStock,
          supplier: supplierName,
          reorderDate,
        },
      },
    };
  };
}
