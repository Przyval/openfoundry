import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  baseUrl: string;
}

export class CredentialStore {
  private credentialsDir: string;
  private credentialsFile: string;

  constructor(basePath?: string) {
    this.credentialsDir = basePath ?? path.join(os.homedir(), ".openfoundry");
    this.credentialsFile = path.join(this.credentialsDir, "credentials.json");
  }

  getCredentialsPath(): string {
    return this.credentialsFile;
  }

  loadCredentials(): Credentials | null {
    try {
      if (!fs.existsSync(this.credentialsFile)) {
        return null;
      }
      const raw = fs.readFileSync(this.credentialsFile, "utf-8");
      const data = JSON.parse(raw) as Credentials;

      if (
        !data.accessToken ||
        !data.refreshToken ||
        !data.expiresAt ||
        !data.baseUrl
      ) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  saveCredentials(creds: Credentials): void {
    if (!fs.existsSync(this.credentialsDir)) {
      fs.mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(
      this.credentialsFile,
      JSON.stringify(creds, null, 2) + "\n",
      { mode: 0o600 },
    );
  }

  clearCredentials(): void {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        fs.unlinkSync(this.credentialsFile);
      }
    } catch {
      // Ignore errors on cleanup
    }
  }

  isTokenExpired(): boolean {
    const creds = this.loadCredentials();
    if (!creds) return true;
    return Date.now() >= creds.expiresAt;
  }
}
