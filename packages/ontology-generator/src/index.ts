export {
  generateObjectInterface,
  mapPropertyTypeToTs,
} from "./object-generator.js";

export {
  generateActionTypes,
  getParamsInterfaceName,
} from "./action-generator.js";

export { generateTypedClient } from "./client-generator.js";

export {
  generateFromOntologyIr,
  type GeneratorOutput,
  type GeneratorFile,
  type GeneratorOptions,
} from "./generator.js";
