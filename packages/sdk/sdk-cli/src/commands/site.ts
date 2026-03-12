import * as fs from "node:fs";
import * as path from "node:path";
import { CredentialStore } from "../config/credentials.js";
import { loadProjectConfig } from "../config/project-config.js";
import { log, error, bold, dim, spinner, table } from "../output.js";
import type { ParsedArgs } from "../cli.js";

function getAuthHeaders(store: CredentialStore): Record<string, string> | null {
  const creds = store.loadCredentials();
  if (!creds) {
    error("Not authenticated. Run 'openfoundry auth login' first.");
    process.exitCode = 1;
    return null;
  }
  if (Date.now() >= creds.expiresAt) {
    error("Token has expired. Run 'openfoundry auth login' to re-authenticate.");
    process.exitCode = 1;
    return null;
  }
  return {
    Authorization: `Bearer ${creds.accessToken}`,
    "Content-Type": "application/json",
  };
}

function collectFiles(dir: string, baseDir: string): Array<{ relativePath: string; absolutePath: string }> {
  const results: Array<{ relativePath: string; absolutePath: string }> = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        relativePath: path.relative(baseDir, fullPath),
        absolutePath: fullPath,
      });
    }
  }

  return results;
}

async function deploy(args: ParsedArgs): Promise<void> {
  loadProjectConfig(); // validate config exists
  const store = new CredentialStore();
  const headers = getAuthHeaders(store);
  if (!headers) return;

  const creds = store.loadCredentials()!;

  const buildDir =
    typeof args.flags["dir"] === "string"
      ? args.flags["dir"]
      : typeof args.flags["build-dir"] === "string"
        ? args.flags["build-dir"]
        : "dist";

  const siteName =
    typeof args.flags["name"] === "string"
      ? args.flags["name"]
      : typeof args.flags["site-name"] === "string"
        ? args.flags["site-name"]
        : undefined;

  const resolvedBuildDir = path.resolve(buildDir);

  if (!fs.existsSync(resolvedBuildDir)) {
    error(`Build directory not found: ${resolvedBuildDir}`);
    error("Build your site first, or specify --dir <path>.");
    process.exitCode = 1;
    return;
  }

  log("");
  log(bold("Deploying static site to OpenFoundry"));
  log("");
  log(`  Directory: ${resolvedBuildDir}`);
  if (siteName) {
    log(`  Site name: ${siteName}`);
  }
  log("");

  const sp = spinner("Collecting files...");

  try {
    const files = collectFiles(resolvedBuildDir, resolvedBuildDir);

    if (files.length === 0) {
      sp.stop();
      error("No files found in the build directory.");
      process.exitCode = 1;
      return;
    }

    sp.update(`Uploading ${files.length} file(s)...`);

    // Step 1: Create or update site resource
    const createSiteUrl = new URL("/api/v1/sites", creds.baseUrl);
    const createResponse = await fetch(createSiteUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: siteName,
        fileCount: files.length,
      }),
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      throw new Error(`Failed to create site (${createResponse.status}): ${text}`);
    }

    const siteData = (await createResponse.json()) as {
      siteId: string;
      uploadUrl: string;
    };

    // Step 2: Upload files
    let uploadedCount = 0;
    for (const file of files) {
      const content = fs.readFileSync(file.absolutePath);
      const uploadUrl = new URL(
        `/api/v1/sites/${siteData.siteId}/files`,
        creds.baseUrl,
      );

      const uploadResponse = await fetch(uploadUrl.toString(), {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          "X-File-Path": file.relativePath,
        },
        body: content,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        throw new Error(
          `Failed to upload ${file.relativePath} (${uploadResponse.status}): ${text}`,
        );
      }

      uploadedCount++;
      sp.update(
        `Uploading files... (${uploadedCount}/${files.length})`,
      );
    }

    // Step 3: Finalize deployment
    sp.update("Finalizing deployment...");
    const finalizeUrl = new URL(
      `/api/v1/sites/${siteData.siteId}/deploy`,
      creds.baseUrl,
    );
    const finalizeResponse = await fetch(finalizeUrl.toString(), {
      method: "POST",
      headers,
    });

    if (!finalizeResponse.ok) {
      const text = await finalizeResponse.text();
      throw new Error(`Failed to finalize deployment (${finalizeResponse.status}): ${text}`);
    }

    const deployData = (await finalizeResponse.json()) as {
      url: string;
      siteId: string;
    };

    sp.stop(`Site deployed successfully!`);
    log("");
    log(`  Site ID: ${deployData.siteId}`);
    log(`  URL:     ${deployData.url}`);
    log("");
  } catch (err) {
    sp.stop();
    throw err;
  }
}

async function list(_args: ParsedArgs): Promise<void> {
  const store = new CredentialStore();
  const headers = getAuthHeaders(store);
  if (!headers) return;

  const creds = store.loadCredentials()!;

  const sp = spinner("Fetching sites...");

  try {
    const url = new URL("/api/v1/sites", creds.baseUrl);
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list sites (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      sites: Array<{
        siteId: string;
        name: string;
        url: string;
        updatedAt: string;
      }>;
    };

    sp.stop();

    if (data.sites.length === 0) {
      log("");
      log("No deployed sites found.");
      log(dim('  Run "openfoundry site deploy" to deploy a site.'));
      return;
    }

    log("");
    log(bold("Deployed Sites"));
    log("");
    log(
      table(
        ["Site ID", "Name", "URL", "Updated"],
        data.sites.map((s) => [s.siteId, s.name, s.url, s.updatedAt]),
      ),
    );
    log("");
  } catch (err) {
    sp.stop();
    throw err;
  }
}

async function deleteSite(args: ParsedArgs): Promise<void> {
  const siteId = args.positional[0];

  if (!siteId) {
    error("Missing site ID. Usage: openfoundry site delete <siteId>");
    process.exitCode = 1;
    return;
  }

  const store = new CredentialStore();
  const headers = getAuthHeaders(store);
  if (!headers) return;

  const creds = store.loadCredentials()!;

  const sp = spinner(`Deleting site ${siteId}...`);

  try {
    const url = new URL(`/api/v1/sites/${siteId}`, creds.baseUrl);
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to delete site (${response.status}): ${text}`);
    }

    sp.stop(`Site ${siteId} deleted successfully.`);
  } catch (err) {
    sp.stop();
    throw err;
  }
}

const SUBCOMMANDS: Record<string, (args: ParsedArgs) => Promise<void>> = {
  deploy,
  list,
  delete: deleteSite,
};

export async function handleSite(args: ParsedArgs): Promise<void> {
  const sub = args.subcommand;

  if (!sub) {
    error("Missing subcommand. Usage: openfoundry site <deploy|list|delete>");
    process.exitCode = 1;
    return;
  }

  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    error(`Unknown site subcommand: ${sub}`);
    error("Available subcommands: deploy, list, delete");
    process.exitCode = 1;
    return;
  }

  await handler(args);
}
