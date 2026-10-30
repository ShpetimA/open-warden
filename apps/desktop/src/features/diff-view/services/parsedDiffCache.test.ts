import { parseDiffFromFile } from "@pierre/diffs";
import { expect, test } from "vitest";

import { createParsedDiffCache, getParsedDiffRequest } from "./parsedDiffCache";

test("a worker failure remains an explicit failure and a subsequent load can recover", async () => {
  let unavailable = true;
  const cache = createParsedDiffCache(async (oldFile, newFile) => {
    if (unavailable) throw new Error("Worker unavailable");
    return parseDiffFromFile(oldFile, newFile);
  });
  const request = getParsedDiffRequest(
    "file.ts",
    { name: "file.ts", contents: "old\n" },
    { name: "file.ts", contents: "new\n" },
  );
  if (!request) throw new Error("Expected a renderable diff request");
  expect(await cache.load(request)).toMatchObject({ ok: false, error: { code: "unexpected" } });
  expect(cache.get(request.key)).toBeUndefined();
  expect(cache.isInFlight(request.key)).toBe(false);
  unavailable = false;
  const recovered = await cache.load(request);
  expect(recovered.ok).toBe(true);
  if (recovered.ok) expect(cache.get(request.key)).toBe(recovered.value);
});
