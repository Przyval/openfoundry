import type { OntologyIr } from "@openfoundry/ontology-ir";
import { generateObjectInterface } from "./object-generator.js";
import { generateActionTypes } from "./action-generator.js";
import { generateTypedClient } from "./client-generator.js";

export interface GeneratorFile {
  readonly path: string;
  readonly content: string;
}

export interface GeneratorOutput {
  readonly files: GeneratorFile[];
}

export interface GeneratorOptions {
  readonly outputDir?: string;
}

/**
 * Generates a full TypeScript SDK from an OntologyIr.
 *
 * Produces:
 * - One file per object type (e.g. Employee.ts)
 * - One actions file (actions.ts)
 * - One client file (client.ts)
 * - One index file (index.ts) that re-exports all
 */
export function generateFromOntologyIr(
  ir: OntologyIr,
  options?: GeneratorOptions,
): GeneratorOutput {
  const outputDir = options?.outputDir ?? "generated";
  const files: GeneratorFile[] = [];
  const indexExports: string[] = [];

  // Generate object type files
  for (const [name, objectType] of Object.entries(ir.objectTypes)) {
    const content = generateObjectInterface(objectType);
    const fileName = `${name}.ts`;
    files.push({
      path: `${outputDir}/${fileName}`,
      content: `// Auto-generated from OntologyIr — do not edit manually\n\n${content}\n`,
    });
    indexExports.push(`export type { ${name} } from "./${name}.js";`);
  }

  // Generate actions file
  if (Object.keys(ir.actionTypes).length > 0) {
    const actionParts: string[] = [];
    const actionExportNames: string[] = [];
    for (const actionType of Object.values(ir.actionTypes)) {
      actionParts.push(generateActionTypes(actionType));
      const paramsName =
        actionType.apiName.charAt(0).toUpperCase() +
        actionType.apiName.slice(1) +
        "Params";
      actionExportNames.push(paramsName);
    }
    const actionsContent = actionParts.join("\n\n");
    files.push({
      path: `${outputDir}/actions.ts`,
      content: `// Auto-generated from OntologyIr — do not edit manually\n\n${actionsContent}\n`,
    });
    const typeNames = actionExportNames.join(", ");
    indexExports.push(`export type { ${typeNames} } from "./actions.js";`);
  }

  // Generate client file
  const clientContent = generateTypedClient(ir);
  const objectImports = Object.keys(ir.objectTypes);
  const actionImports = Object.keys(ir.actionTypes).map(
    (n) => n.charAt(0).toUpperCase() + n.slice(1) + "Params",
  );

  const clientImports: string[] = [];
  if (objectImports.length > 0) {
    for (const name of objectImports) {
      clientImports.push(`import type { ${name} } from "./${name}.js";`);
    }
  }
  if (actionImports.length > 0) {
    clientImports.push(
      `import type { ${actionImports.join(", ")} } from "./actions.js";`,
    );
  }

  const clientFileContent = [
    "// Auto-generated from OntologyIr — do not edit manually",
    "",
    ...clientImports,
    "",
    clientContent,
    "",
  ].join("\n");

  files.push({
    path: `${outputDir}/client.ts`,
    content: clientFileContent,
  });
  indexExports.push(
    `export type { OntologyClient, ObjectApi, ActionResult } from "./client.js";`,
  );

  // Generate index file
  const indexContent = [
    "// Auto-generated from OntologyIr — do not edit manually",
    "",
    ...indexExports,
    "",
  ].join("\n");

  files.push({
    path: `${outputDir}/index.ts`,
    content: indexContent,
  });

  return { files };
}
