import { z } from "zod";
import { gitObjectIdSchema } from "./gitObjectId";
import { imageFileSchema } from "./imagePreview";

export const diffFileSchema = z.strictObject({
  name: z.string(),
  contents: z.string().refine((value) => !value.includes("\0")),
});

const binaryFileSchema = z.strictObject({
  kind: z.enum(["binary", "too-large"]),
  name: z.string(),
  byteLength: z.number().int().nonnegative(),
});

const symlinkFileSchema = z.strictObject({
  kind: z.literal("symlink"),
  name: z.string(),
  target: z.string(),
});

const submoduleFileSchema = z.strictObject({
  kind: z.literal("submodule"),
  name: z.string(),
  commitId: gitObjectIdSchema,
  workingTree: z
    .discriminatedUnion("state", [
      z.strictObject({ state: z.literal("uninitialized") }),
      z.strictObject({
        state: z.literal("checked-out"),
        trackedChanges: z.boolean(),
        untrackedChanges: z.boolean(),
      }),
    ])
    .optional(),
});

export const fileContentMetadataSchema = z.union([
  binaryFileSchema,
  symlinkFileSchema,
  submoduleFileSchema,
  imageFileSchema,
]);

export const fileContentSchema = z.union([diffFileSchema, fileContentMetadataSchema]);

export const gitFileModeSchema = z.enum(["100644", "100755", "120000", "160000"]);

export const fileModeChangeSchema = z
  .strictObject({
    before: gitFileModeSchema,
    after: gitFileModeSchema,
  })
  .refine((value) => value.before !== value.after);

export const fileVersionsSchema = z.strictObject({
  oldFile: fileContentSchema.nullable(),
  newFile: fileContentSchema.nullable(),
  modeChange: fileModeChangeSchema.optional(),
});

export type DiffFile = Readonly<z.infer<typeof diffFileSchema>>;
export type FileContentMetadata = Readonly<z.infer<typeof fileContentMetadataSchema>>;
export type FileContent = DiffFile | FileContentMetadata;
export type GitFileMode = z.infer<typeof gitFileModeSchema>;
export type FileModeChange = Readonly<z.infer<typeof fileModeChangeSchema>>;
export type FileVersions = Readonly<{
  oldFile: FileContent | null;
  newFile: FileContent | null;
  modeChange?: FileModeChange;
}>;

export function getTextFile(file: FileContent | null): DiffFile | null {
  return file && "contents" in file ? file : null;
}

export function getFileContentMetadata(file: FileContent | null): FileContentMetadata | null {
  return file && "kind" in file ? file : null;
}

export function getDiffTextFile(versions: FileVersions | null): DiffFile | null {
  if (
    !versions ||
    getFileContentMetadata(versions.oldFile) ||
    getFileContentMetadata(versions.newFile)
  ) {
    return null;
  }

  const before = getTextFile(versions.oldFile);
  const after = getTextFile(versions.newFile);

  if (versions.modeChange && before && after && before.contents === after.contents) return null;

  return after;
}
