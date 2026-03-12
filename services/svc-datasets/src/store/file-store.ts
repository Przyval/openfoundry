import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredFile {
  path: string;
  size: number;
  contentType: string;
  content: Uint8Array;
  transactionRid: string;
}

// ---------------------------------------------------------------------------
// FileStore — in-memory file storage keyed by datasetRid + path
// ---------------------------------------------------------------------------

export class FileStore {
  /** Key: `${datasetRid}::${path}` */
  private readonly files = new Map<string, StoredFile>();

  private key(datasetRid: string, path: string): string {
    return `${datasetRid}::${path}`;
  }

  putFile(
    datasetRid: string,
    path: string,
    content: Uint8Array,
    contentType: string,
    transactionRid: string,
  ): StoredFile {
    const file: StoredFile = {
      path,
      size: content.byteLength,
      contentType,
      content,
      transactionRid,
    };
    this.files.set(this.key(datasetRid, path), file);
    return file;
  }

  getFile(datasetRid: string, path: string): StoredFile {
    const file = this.files.get(this.key(datasetRid, path));
    if (!file) {
      throw notFound("File", path);
    }
    return file;
  }

  listFiles(datasetRid: string): StoredFile[] {
    const prefix = `${datasetRid}::`;
    const result: StoredFile[] = [];
    for (const [key, file] of this.files) {
      if (key.startsWith(prefix)) {
        result.push(file);
      }
    }
    return result;
  }

  deleteFile(datasetRid: string, path: string): void {
    const k = this.key(datasetRid, path);
    if (!this.files.has(k)) {
      throw notFound("File", path);
    }
    this.files.delete(k);
  }
}
