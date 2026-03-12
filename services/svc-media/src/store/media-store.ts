import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredMedia {
  rid: string;
  filename: string;
  contentType: string;
  size: number;
  content: Uint8Array;
  metadata: Record<string, string>;
  uploadedBy?: string;
  createdAt: string;
}

export interface MediaMetadata {
  rid: string;
  filename: string;
  contentType: string;
  size: number;
  metadata: Record<string, string>;
  uploadedBy?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// IMediaStore — shared interface for all store backends
// ---------------------------------------------------------------------------

export interface IMediaStore {
  store(
    filename: string,
    contentType: string,
    content: Uint8Array,
    metadata?: Record<string, string>,
    uploadedBy?: string,
  ): StoredMedia | Promise<StoredMedia>;

  get(rid: string): StoredMedia | Promise<StoredMedia>;

  delete(rid: string): void | Promise<void>;

  list(options?: any): StoredMedia[] | MediaMetadata[] | Promise<StoredMedia[]> | Promise<MediaMetadata[]>;

  getMetadata(rid: string): MediaMetadata | Promise<MediaMetadata>;

  updateMetadata(rid: string, metadata: Record<string, string>): MediaMetadata | Promise<MediaMetadata>;
}

// ---------------------------------------------------------------------------
// MediaStore — in-memory storage for media/attachments
// ---------------------------------------------------------------------------

export class MediaStore implements IMediaStore {
  private readonly media = new Map<string, StoredMedia>();

  store(
    filename: string,
    contentType: string,
    content: Uint8Array,
    metadata: Record<string, string> = {},
    uploadedBy?: string,
  ): StoredMedia {
    const rid = generateRid("media", "media").toString();
    const entry: StoredMedia = {
      rid,
      filename,
      contentType,
      size: content.byteLength,
      content,
      metadata,
      uploadedBy,
      createdAt: new Date().toISOString(),
    };
    this.media.set(rid, entry);
    return entry;
  }

  get(rid: string): StoredMedia {
    const entry = this.media.get(rid);
    if (!entry) {
      throw notFound("Media", rid);
    }
    return entry;
  }

  delete(rid: string): void {
    if (!this.media.has(rid)) {
      throw notFound("Media", rid);
    }
    this.media.delete(rid);
  }

  list(): StoredMedia[] {
    return Array.from(this.media.values());
  }

  getMetadata(rid: string): MediaMetadata {
    const entry = this.get(rid);
    return {
      rid: entry.rid,
      filename: entry.filename,
      contentType: entry.contentType,
      size: entry.size,
      metadata: entry.metadata,
      uploadedBy: entry.uploadedBy,
      createdAt: entry.createdAt,
    };
  }

  updateMetadata(rid: string, metadata: Record<string, string>): MediaMetadata {
    const entry = this.get(rid);
    entry.metadata = { ...entry.metadata, ...metadata };
    return this.getMetadata(rid);
  }
}
