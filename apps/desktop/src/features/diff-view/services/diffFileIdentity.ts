import type { DiffFile } from "@/features/source-control/types";

const identityByFile = new WeakMap<DiffFile, string>();

function hashStringFNV1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

/**
 * Returns a content-based identity while hashing each immutable file object at most once.
 * Callers must replace a file object when its name or contents change.
 */
export function getDiffFileIdentity(file: DiffFile | null): string {
  if (!file) return "missing";

  const cachedIdentity = identityByFile.get(file);
  if (cachedIdentity) return cachedIdentity;

  const identity = `f-${hashStringFNV1a(file.name)}-${file.contents.length}-${hashStringFNV1a(file.contents)}`;
  identityByFile.set(file, identity);
  return identity;
}
