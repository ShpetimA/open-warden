import { z } from "zod";

export const diffFileSchema = z.strictObject({
  name: z.string(),
  contents: z.string().refine((value) => !value.includes("\0")),
});

export const fileContentMetadataSchema = z.strictObject({
  kind: z.enum(["binary", "too-large"]),
  name: z.string(),
  byteLength: z.number().int().nonnegative(),
});

export const fileContentSchema = z.union([diffFileSchema, fileContentMetadataSchema]);

export const fileVersionsSchema = z.strictObject({
  oldFile: fileContentSchema.nullable(),
  newFile: fileContentSchema.nullable(),
});

export type DiffFile = Readonly<z.infer<typeof diffFileSchema>>;
export type FileContentMetadata = Readonly<z.infer<typeof fileContentMetadataSchema>>;
export type FileContent = DiffFile | FileContentMetadata;
export type FileVersions = Readonly<{
  oldFile: FileContent | null;
  newFile: FileContent | null;
}>;

export function getTextFile(file: FileContent | null): DiffFile | null {
  return file && "contents" in file ? file : null;
}

export function getFileContentMetadata(file: FileContent | null): FileContentMetadata | null {
  return file && "kind" in file ? file : null;
}
