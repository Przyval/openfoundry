import type { OntologyIr } from "@openfoundry/ontology-ir";
import { getParamsInterfaceName } from "./action-generator.js";

/**
 * Generates a typed OntologyClient interface from the full IR.
 */
export function generateTypedClient(ir: OntologyIr): string {
  const lines: string[] = [];

  // Supporting type definitions
  lines.push("export interface ObjectApi<T> {");
  lines.push("  get(primaryKey: string): Promise<T | undefined>;");
  lines.push("  list(): Promise<T[]>;");
  lines.push("  filter(where: Partial<T>): Promise<T[]>;");
  lines.push("}");
  lines.push("");
  lines.push("export interface ActionResult {");
  lines.push("  success: boolean;");
  lines.push("  error?: string;");
  lines.push("}");
  lines.push("");

  // Client interface
  lines.push("export interface OntologyClient {");

  // Objects
  lines.push("  objects: {");
  for (const objectTypeName of Object.keys(ir.objectTypes)) {
    lines.push(`    ${objectTypeName}: ObjectApi<${objectTypeName}>;`);
  }
  lines.push("  };");

  // Actions
  lines.push("  actions: {");
  for (const actionName of Object.keys(ir.actionTypes)) {
    const paramsName = getParamsInterfaceName(actionName);
    lines.push(
      `    ${actionName}: (params: ${paramsName}) => Promise<ActionResult>;`,
    );
  }
  lines.push("  };");

  lines.push("}");

  return lines.join("\n");
}
