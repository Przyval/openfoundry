import type { ActionTypeIr, ParameterIr } from "@openfoundry/ontology-ir";
import { mapPropertyTypeToTs } from "./object-generator.js";

/**
 * Converts an action apiName to a PascalCase params interface name.
 * e.g. "createEmployee" -> "CreateEmployeeParams"
 */
function toParamsInterfaceName(apiName: string): string {
  const pascal = apiName.charAt(0).toUpperCase() + apiName.slice(1);
  return `${pascal}Params`;
}

function generateParameterLine(name: string, param: ParameterIr): string {
  const tsType = mapPropertyTypeToTs(param.type);
  const optional = param.required ? "" : "?";
  return `  ${name}${optional}: ${tsType};`;
}

/**
 * Generates a TypeScript params interface for an action type.
 */
export function generateActionTypes(actionType: ActionTypeIr): string {
  const lines: string[] = [];
  const interfaceName = toParamsInterfaceName(actionType.apiName);

  lines.push(`export interface ${interfaceName} {`);

  for (const [name, param] of Object.entries(actionType.parameters)) {
    if (param.description) {
      lines.push(`  // ${param.description}`);
    }
    lines.push(generateParameterLine(name, param));
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Returns the PascalCase params interface name for a given action apiName.
 */
export function getParamsInterfaceName(apiName: string): string {
  return toParamsInterfaceName(apiName);
}
