import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectConfig {
  baseUrl: string;
  conjureDir: string;
  outputDir: string;
  ontologyFile: string;
}

const DEFAULTS: ProjectConfig = {
  baseUrl: "https://app.openfoundry.dev",
  conjureDir: "conjure",
  outputDir: "src/generated",
  ontologyFile: "ontology.yaml",
};

const CONFIG_FILENAME = "foundry.config.json";

export function loadProjectConfig(cwd?: string): ProjectConfig {
  const dir = cwd ?? process.cwd();
  const configPath = path.join(dir, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const userConfig = JSON.parse(raw) as Partial<ProjectConfig>;

    return {
      baseUrl: userConfig.baseUrl ?? DEFAULTS.baseUrl,
      conjureDir: userConfig.conjureDir ?? DEFAULTS.conjureDir,
      outputDir: userConfig.outputDir ?? DEFAULTS.outputDir,
      ontologyFile: userConfig.ontologyFile ?? DEFAULTS.ontologyFile,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getConfigPath(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return path.join(dir, CONFIG_FILENAME);
}
