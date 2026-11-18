import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const maximumImageBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

export interface ImageUploadForm {
  key: string;
  url: string;
  fields: Record<string, string>;
}

export interface ImageStorage {
  isConfigured(): boolean;
  createUpload(sub: string, contentType: string): Promise<ImageUploadForm>;
  createReadUrl(key: string): Promise<string>;
  imageExists(key: string): Promise<boolean>;
}

export class ImageStorageConfigurationError extends Error {
  constructor() {
    super('El almacenamiento de imágenes aún no está configurado.');
    this.name = 'ImageStorageConfigurationError';
  }
}

export class UnsupportedImageTypeError extends Error {
  constructor() {
    super('Solo se permiten imágenes JPEG, PNG o WebP.');
    this.name = 'UnsupportedImageTypeError';
  }
}

const bucket = process.env['IMAGES_BUCKET'] ?? '';
const s3 = new S3Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

export class S3ImageStorage implements ImageStorage {
  constructor(
    private readonly bucketName = bucket,
    private readonly client = s3
  ) {}

  isConfigured(): boolean {
    return Boolean(this.bucketName);
  }

  async createUpload(sub: string, contentType: string): Promise<ImageUploadForm> {
    if (!this.isConfigured()) throw new ImageStorageConfigurationError();
    const extension = allowedImageTypes.get(contentType);
    if (!extension) throw new UnsupportedImageTypeError();
    const key = `merchant-images/${sub}/${randomUUID()}.${extension}`;
    const signed = await createPresignedPost(this.client, {
      Bucket: this.bucketName,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', 1, maximumImageBytes],
        ['eq', '$Content-Type', contentType]
      ]
    });
    return { key, url: signed.url, fields: signed.fields };
  }

  async createReadUrl(key: string): Promise<string> {
    if (!this.isConfigured()) throw new ImageStorageConfigurationError();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      { expiresIn: 60 * 60 }
    );
  }

  async imageExists(key: string): Promise<boolean> {
    if (!this.isConfigured()) throw new ImageStorageConfigurationError();
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key })
      );
      return true;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'NotFound'
      ) {
        return false;
      }
      throw error;
    }
  }
}
