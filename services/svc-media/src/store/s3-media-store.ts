import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";
import type { StoredMedia, MediaMetadata } from "./media-store.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface S3Config {
  /** Custom endpoint for MinIO or S3-compatible services. */
  endpoint?: string;
  /** AWS region (e.g. "us-east-1"). */
  region: string;
  /** Bucket name. */
  bucket: string;
  /** AWS access key ID. */
  accessKeyId: string;
  /** AWS secret access key. */
  secretAccessKey: string;
  /** Use path-style URLs (required for MinIO). */
  forcePathStyle?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prefix used for all media objects in the bucket. */
const KEY_PREFIX = "media/";

function objectKey(rid: string): string {
  return `${KEY_PREFIX}${rid}`;
}

async function streamToUint8Array(
  stream: ReadableStream | NodeJS.ReadableStream | Blob | undefined,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);

  // AWS SDK v3 returns a web ReadableStream (or Node stream) for Body
  if ("transformToByteArray" in (stream as any)) {
    return new Uint8Array(await (stream as any).transformToByteArray());
  }

  // Fallback: collect chunks from an async iterable
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// ---------------------------------------------------------------------------
// S3MediaStore
// ---------------------------------------------------------------------------

export class S3MediaStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? !!config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  // -----------------------------------------------------------------------
  // store
  // -----------------------------------------------------------------------

  async store(
    filename: string,
    contentType: string,
    content: Uint8Array,
    metadata: Record<string, string> = {},
    uploadedBy?: string,
  ): Promise<StoredMedia> {
    const rid = generateRid("media", "media").toString();
    const createdAt = new Date().toISOString();

    const s3Metadata: Record<string, string> = {
      ...metadata,
      "x-of-filename": filename,
      "x-of-created-at": createdAt,
      ...(uploadedBy ? { "x-of-uploaded-by": uploadedBy } : {}),
    };

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(rid),
        Body: content,
        ContentType: contentType,
        Metadata: s3Metadata,
      }),
    );

    return {
      rid,
      filename,
      contentType,
      size: content.byteLength,
      content,
      metadata,
      uploadedBy,
      createdAt,
    };
  }

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  async get(rid: string): Promise<StoredMedia> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey(rid),
        }),
      );

      const content = await streamToUint8Array(response.Body as any);
      const s3Meta = response.Metadata ?? {};

      const { filename, metadata, uploadedBy, createdAt } =
        this.extractMetadata(s3Meta);

      return {
        rid,
        filename,
        contentType: response.ContentType ?? "application/octet-stream",
        size: content.byteLength,
        content,
        metadata,
        uploadedBy,
        createdAt,
      };
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        throw notFound("Media", rid);
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  async delete(rid: string): Promise<void> {
    // Verify the object exists first so we can throw notFound consistently
    await this.getMetadata(rid);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(rid),
      }),
    );
  }

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  async list(options?: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  }): Promise<MediaMetadata[]> {
    const prefix = options?.prefix
      ? `${KEY_PREFIX}${options.prefix}`
      : KEY_PREFIX;

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: options?.maxKeys ?? 1000,
        ContinuationToken: options?.continuationToken,
      }),
    );

    const results: MediaMetadata[] = [];
    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const rid = obj.Key.replace(KEY_PREFIX, "");
      try {
        const meta = await this.getMetadata(rid);
        results.push(meta);
      } catch {
        // skip objects we cannot read metadata for
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // getMetadata
  // -----------------------------------------------------------------------

  async getMetadata(rid: string): Promise<MediaMetadata> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey(rid),
        }),
      );

      const s3Meta = response.Metadata ?? {};
      const { filename, metadata, uploadedBy, createdAt } =
        this.extractMetadata(s3Meta);

      return {
        rid,
        filename,
        contentType: response.ContentType ?? "application/octet-stream",
        size: response.ContentLength ?? 0,
        metadata,
        uploadedBy,
        createdAt,
      };
    } catch (err: any) {
      if (
        err.name === "NotFound" ||
        err.name === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        throw notFound("Media", rid);
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // updateMetadata
  // -----------------------------------------------------------------------

  async updateMetadata(
    rid: string,
    metadata: Record<string, string>,
  ): Promise<MediaMetadata> {
    // Fetch current metadata first
    const current = await this.getMetadata(rid);
    const merged = { ...current.metadata, ...metadata };

    // Head to get existing S3 user-metadata
    const headResponse = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(rid),
      }),
    );

    const existingS3Meta = headResponse.Metadata ?? {};
    const newS3Meta: Record<string, string> = {
      ...existingS3Meta,
      ...metadata,
    };

    // CopyObject in-place to update metadata
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(rid),
        CopySource: `${this.bucket}/${objectKey(rid)}`,
        ContentType: current.contentType,
        Metadata: newS3Meta,
        MetadataDirective: "REPLACE",
      }),
    );

    return {
      ...current,
      metadata: merged,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private extractMetadata(s3Meta: Record<string, string>): {
    filename: string;
    metadata: Record<string, string>;
    uploadedBy?: string;
    createdAt: string;
  } {
    const filename = s3Meta["x-of-filename"] ?? "unknown";
    const createdAt = s3Meta["x-of-created-at"] ?? new Date().toISOString();
    const uploadedBy = s3Meta["x-of-uploaded-by"] || undefined;

    // Build user metadata by excluding our internal keys
    const internalKeys = new Set([
      "x-of-filename",
      "x-of-created-at",
      "x-of-uploaded-by",
    ]);
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(s3Meta)) {
      if (!internalKeys.has(key)) {
        metadata[key] = value;
      }
    }

    return { filename, metadata, uploadedBy, createdAt };
  }
}
