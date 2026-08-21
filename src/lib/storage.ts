import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

import { slugify } from "@/lib/resources";

/**
 * Object storage for uploaded artwork.
 *
 * The bucket speaks S3, but it is *not* world-readable: it refuses bucket
 * policies outright ("NotImplemented") and answers an unsigned GET with 403, on
 * both the path-style and the virtual-host URL. So nothing here hands out a
 * bucket URL — an upload is stored under a key, and that key is served back
 * through `/api/images/…`, which signs the read on the server.
 *
 * If the bucket is ever made public, set STORAGE_PUBLIC_BASE_URL to its public
 * origin and new uploads save pointing straight at it instead. Rows already
 * saved keep the `/api/images/…` form and keep working.
 */

const PREFIX = "images";

/** What the storefront and the dashboard will actually render in an <img>. */
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type ImageType = (typeof ALLOWED_TYPES)[number];

export const ACCEPT_ATTRIBUTE = ALLOWED_TYPES.join(",");

/** Comfortably above a camera-sized product photo, well below a memory problem. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export interface StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Null rather than a throw, so a deployment without storage keys still runs —
 * the URL fields keep working by hand and only the upload button is refused.
 */
function config(): StorageConfig | null {
  const endpoint = env("STORAGE_ENDPOINT");
  const bucket = env("STORAGE_BUCKET");
  const accessKeyId = env("STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = env("STORAGE_SECRET_ACCESS_KEY");

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    // The provider ignores the region, but the SDK insists on one being set.
    region: env("STORAGE_REGION") || "auto",
  };
}

export function storageConfigured(): boolean {
  return config() !== null;
}

let client: S3Client | null = null;

function s3(settings: StorageConfig): S3Client {
  // One client per process: it pools sockets, and rebuilding it per request is
  // how an upload ends up slower than the transfer it is doing.
  client ??= new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    // The bucket name is not a usable TLS hostname label here; path style is
    // what this endpoint answers on.
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
  return client;
}

/**
 * The bytes decide the type, not the browser.
 *
 * These files are served back from our own origin, so an "image/png" that is
 * really HTML would be a scripting hole. `/api/images` also refuses to sniff
 * and sandboxes what it sends, but the cheapest fix is to never store the file
 * in the first place.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;

  const at = (index: number, ...expected: number[]) =>
    expected.every((byte, offset) => bytes[index + offset] === byte);
  const ascii = (index: number, text: string) =>
    [...text].every((char, offset) => bytes[index + offset] === char.charCodeAt(0));

  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  // ISO base media: a length prefix, then `ftyp`, then the brand.
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "image/avif";

  return null;
}

/**
 * `images/products/2026/08/marble-mortar-V1StGXR8yq.jpg`
 *
 * Dated so the bucket stays browsable, suffixed with a random id so two uploads
 * of `IMG_0042.jpg` never collide, and keeping a readable stem so the client
 * can recognise a file in the bucket listing.
 */
function buildKey(folder: string, filename: string, type: ImageType, now: Date): string {
  const stem = slugify(filename.replace(/\.[^.]+$/, "")).slice(0, 60) || "image";
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${PREFIX}/${folder}/${year}/${month}/${stem}-${nanoid(10)}.${EXTENSIONS[type]}`;
}

/** Keys we are willing to serve back, so the proxy can never read anything else. */
export function isServableKey(key: string): boolean {
  return (
    key.startsWith(`${PREFIX}/`) &&
    !key.includes("..") &&
    key.length <= 300 &&
    /^[a-zA-Z0-9/_.-]+$/.test(key)
  );
}

/**
 * `/api/images` is already the prefix, so the URL carries the rest of the key
 * and this puts it back — no `/api/images/images/…`.
 */
export function keyFromPath(segments: string[]): string {
  return `${PREFIX}/${segments.join("/")}`;
}

/**
 * Absolute, because the storefront reads these out of the public API and
 * renders them on its own domain — a relative path would resolve against the
 * wrong host there.
 */
export function publicUrl(key: string): string {
  const override = env("STORAGE_PUBLIC_BASE_URL");
  // A public bucket is addressed by the whole key, prefix included.
  if (override) return `${override.replace(/\/+$/, "")}/${key}`;

  const origin = env("DASHBOARD_URL").replace(/\/+$/, "");
  return `${origin}/api/images/${key.slice(PREFIX.length + 1)}`;
}

export interface UploadResult {
  key: string;
  url: string;
  type: ImageType;
  size: number;
}

export type UploadOutcome =
  | { ok: true; result: UploadResult }
  | { ok: false; error: string };

export async function uploadImage(
  file: File,
  folder: string,
  now: Date = new Date()
): Promise<UploadOutcome> {
  const settings = config();
  if (!settings) return { ok: false, error: "Image storage is not configured." };

  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Images must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return { ok: false, error: "That is not a JPEG, PNG, WebP, AVIF or GIF image." };
  }

  const key = buildKey(folder, file.name || "image", type, now);

  await s3(settings).send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: bytes,
      ContentType: type,
      // Keys are unique per upload, so a stored image is never rewritten and
      // can be cached for as long as the browser likes.
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return { ok: true, result: { key, url: publicUrl(key), type, size: file.size } };
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  etag?: string;
}

/** Null when the key is not in the bucket; anything else throws. */
export async function readImage(key: string): Promise<StoredObject | null> {
  const settings = config();
  if (!settings) return null;

  try {
    const object = await s3(settings).send(
      new GetObjectCommand({ Bucket: settings.bucket, Key: key })
    );
    if (!object.Body) return null;

    return {
      body: object.Body.transformToWebStream(),
      // Falls back to a type no browser will script, rather than to whatever
      // the uploader once claimed.
      contentType: object.ContentType ?? "application/octet-stream",
      contentLength: object.ContentLength,
      etag: object.ETag,
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

/**
 * Not wired into the forms on purpose: duplicating a product copies its image
 * URLs, so a "replaced" image may still be the cover of another row. Clearing
 * the bucket out is a deliberate chore, not a side effect of an edit.
 */
export async function deleteImage(key: string): Promise<void> {
  const settings = config();
  if (!settings) return;

  await s3(settings).send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
}
