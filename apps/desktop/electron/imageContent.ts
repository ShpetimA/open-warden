import { createHash } from "node:crypto";
import { imageSize } from "image-size";

import {
  IMAGE_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_MAX_PIXELS,
  IMAGE_PREVIEW_MAX_DIMENSION,
  type ImageFile,
  type ImageSource,
} from "../src/platform/desktop/imagePreview";

type ImageLocation =
  | Extract<ImageSource, { kind: "git" }>
  | Omit<Extract<ImageSource, { kind: "worktree" }>, "digest">;

function rasterMimeType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";

  const header = bytes.toString("ascii", 0, 12);
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";

  return null;
}

export function imageDigest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readImageFile(
  bytes: Buffer,
  name: string,
  location: ImageLocation,
): ImageFile | null {
  const mimeType = rasterMimeType(bytes);
  if (!mimeType) return null;

  const base = { kind: "image" as const, name, byteLength: bytes.length };
  if (bytes.length > IMAGE_PREVIEW_MAX_BYTES) {
    return { ...base, preview: { state: "unavailable", reason: "byte-limit" } };
  }

  try {
    const dimensions = imageSize(bytes);
    const rotated =
      dimensions.orientation !== undefined &&
      dimensions.orientation >= 5 &&
      dimensions.orientation <= 8;
    const width = rotated ? dimensions.height : dimensions.width;
    const height = rotated ? dimensions.width : dimensions.height;

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      return { ...base, preview: { state: "unavailable", reason: "invalid-image" } };
    }

    if (
      width > IMAGE_PREVIEW_MAX_DIMENSION ||
      height > IMAGE_PREVIEW_MAX_DIMENSION ||
      width * height > IMAGE_PREVIEW_MAX_PIXELS
    ) {
      return { ...base, preview: { state: "unavailable", reason: "pixel-limit" } };
    }

    const source: ImageSource =
      location.kind === "git" ? location : { ...location, digest: imageDigest(bytes) };

    return { ...base, preview: { state: "available", mimeType, width, height, source } };
  } catch {
    return { ...base, preview: { state: "unavailable", reason: "invalid-image" } };
  }
}
