import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@openrive/shared/env';

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  health(): Promise<void>;
  close(): void;
}

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function validKey(key: string): string {
  const normalized = key.trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\') || normalized.split('/').some((part) => part === '..')) {
    throw new Error('Invalid object storage key');
  }
  return normalized;
}

function isMissingObject(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NoSuchKey' || candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}

class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: validKey(key),
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: validKey(key) }));
      if (!result.Body) return null;
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: validKey(key) }));
  }

  async health(): Promise<void> {
    // Listing one key is more portable than HeadBucket: some S3-compatible
    // providers authorize bucket listing but reject HEAD bucket probes.
    await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, MaxKeys: 1 }));
  }

  close(): void {
    this.client.destroy();
  }
}

export function createObjectStorage(config?: ObjectStorageConfig): ObjectStorage {
  const settings = env();
  const resolved =
    config ??
    (settings.OPENRIVE_STORAGE_ENDPOINT &&
      settings.OPENRIVE_STORAGE_BUCKET &&
      settings.OPENRIVE_STORAGE_ACCESS_KEY_ID &&
      settings.OPENRIVE_STORAGE_SECRET_ACCESS_KEY
      ? {
          endpoint: settings.OPENRIVE_STORAGE_ENDPOINT,
          region: settings.OPENRIVE_STORAGE_REGION,
          bucket: settings.OPENRIVE_STORAGE_BUCKET,
          accessKeyId: settings.OPENRIVE_STORAGE_ACCESS_KEY_ID,
          secretAccessKey: settings.OPENRIVE_STORAGE_SECRET_ACCESS_KEY,
          forcePathStyle: settings.OPENRIVE_STORAGE_FORCE_PATH_STYLE,
        }
      : null);
  if (!resolved) throw new Error('Object storage is not configured');
  return new S3ObjectStorage(resolved);
}

export function projectRivKey(projectId: string): string {
  return `projects/${projectId}/riv/${crypto.randomUUID()}.riv`;
}

export function legacyProjectRivKey(projectId: string): string {
  return `projects/${projectId}/riv/legacy.riv`;
}
