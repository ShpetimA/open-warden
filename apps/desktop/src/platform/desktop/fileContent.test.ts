import { expect, test } from "vitest";

import { fileContentSchema, fileVersionsSchema } from "./fileContent";

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
