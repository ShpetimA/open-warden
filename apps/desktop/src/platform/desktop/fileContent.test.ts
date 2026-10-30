import { expect, test } from "vitest";

import {
  fileContentSchema,
  fileVersionsSchema,
  fileModeChangeSchema,
  getDiffTextFile,
} from "./fileContent";

test("file replies retain absent, text and binary sides independently", () => {
  const reply = {
    oldFile: { kind: "binary", name: "before.dat", byteLength: 25 },
    newFile: { name: "after.txt", contents: "Converted to text\n" },
  };

  expect(fileVersionsSchema.parse(reply)).toEqual(reply);
  expect(fileVersionsSchema.parse({ oldFile: null, newFile: reply.oldFile })).toEqual({
    oldFile: null,
    newFile: reply.oldFile,
  });
});

test("parses link targets and submodule checkout states without accepting text payloads", () => {
  expect(fileContentSchema.parse({ kind: "symlink", name: "link", target: "../outside" })).toEqual({
    kind: "symlink",
    name: "link",
    target: "../outside",
  });

  const commitId = "a".repeat(40);
  expect(fileContentSchema.safeParse({ kind: "submodule", name: "module", commitId }).success).toBe(
    true,
  );

  for (const invalid of [
    { kind: "submodule", name: "module", commitId: "not-a-commit" },
    { kind: "symlink", name: "link", target: "outside", contents: "Target contents" },
    {
      kind: "submodule",
      name: "module",
      commitId,
      workingTree: { state: "uninitialized", trackedChanges: true },
    },
  ]) {
    expect(fileContentSchema.safeParse(invalid).success).toBe(false);
  }

  expect(fileModeChangeSchema.safeParse({ before: "100644", after: "100755" }).success).toBe(true);
  expect(fileModeChangeSchema.safeParse({ before: "100644", after: "100644" }).success).toBe(false);
  expect(fileModeChangeSchema.safeParse({ before: "100644", after: "777777" }).success).toBe(false);
});

test("rejects contradictory or unreadable file metadata at the IPC boundary", () => {
  const invalidReplies: unknown[] = [
    { kind: "binary", name: "file.bin", byteLength: -1 },
    { kind: "binary", name: "file.bin", byteLength: 1.5 },
    { kind: "binary", name: "file.bin", byteLength: 2, contents: "Wrong representation" },
    { name: "file.bin", contents: "\0" },
    { kind: "unknown", name: "file.bin", byteLength: 2 },
  ];

  for (const reply of invalidReplies) {
    expect(fileContentSchema.safeParse(reply).success).toBe(false);
  }
});

test("only exposes code to diff tooling when a text diff is visible", () => {
  const text = { name: "script.sh", contents: "echo deploy\n" };

  expect(getDiffTextFile({ oldFile: text, newFile: text })).toEqual(text);
  expect(
    getDiffTextFile({
      oldFile: text,
      newFile: text,
      modeChange: { before: "100644", after: "100755" },
    }),
  ).toBeNull();
  expect(
    getDiffTextFile({
      oldFile: { kind: "symlink", name: text.name, target: "outside" },
      newFile: text,
      modeChange: { before: "120000", after: "100644" },
    }),
  ).toBeNull();
});
