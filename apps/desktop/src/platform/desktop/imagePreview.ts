import { z } from "zod";

import { gitObjectIdSchema } from "./gitObjectId";

export const IMAGE_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_PREVIEW_MAX_PIXELS = 16_000_000;
export const IMAGE_PREVIEW_MAX_DIMENSION = 16_384;

export const imageMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const digestSchema = z
  .string()
  .length(64)
  .refine((value) => [...value].every((character) => "0123456789abcdef".includes(character)));

const relativeImagePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes("\0") &&
      !value.includes("\\") &&
      value
        .split("/")
        .every(
          (part) => part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git",
        ),
  );

export const imageSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("git"),
    repoPath: z.string().min(1),
    objectId: gitObjectIdSchema,
  }),
  z.strictObject({
    kind: z.literal("worktree"),
    repoPath: z.string().min(1),
    relPath: relativeImagePath,
    digest: digestSchema,
  }),
]);

const dimensions = {
  width: z.number().int().positive().max(IMAGE_PREVIEW_MAX_DIMENSION),
  height: z.number().int().positive().max(IMAGE_PREVIEW_MAX_DIMENSION),
};

export const imageFileSchema = z
  .strictObject({
    kind: z.literal("image"),
    name: z.string(),
    byteLength: z.number().int().nonnegative(),
    preview: z.discriminatedUnion("state", [
      z
        .strictObject({
          state: z.literal("available"),
          mimeType: imageMimeTypeSchema,
          ...dimensions,
          source: imageSourceSchema,
        })
        .refine((value) => value.width * value.height <= IMAGE_PREVIEW_MAX_PIXELS),
      z.strictObject({
        state: z.literal("unavailable"),
        reason: z.enum(["byte-limit", "pixel-limit", "invalid-image"]),
      }),
    ]),
  })
  .refine(
    (value) => value.preview.state !== "available" || value.byteLength <= IMAGE_PREVIEW_MAX_BYTES,
  );

export const imagePreviewDataSchema = z
  .strictObject({
    ...dimensions,
    byteLength: z.number().int().nonnegative().max(IMAGE_PREVIEW_MAX_BYTES),
    mimeType: imageMimeTypeSchema,
    bytes: z.instanceof(Uint8Array),
  })
  .refine((value) => {
    return (
      value.width * value.height <= IMAGE_PREVIEW_MAX_PIXELS &&
      value.bytes.byteLength === value.byteLength
    );
  });

export type ImageSource = Readonly<z.infer<typeof imageSourceSchema>>;
export type ImageFile = Readonly<z.infer<typeof imageFileSchema>>;
export type ImagePreviewData = Readonly<z.infer<typeof imagePreviewDataSchema>>;
