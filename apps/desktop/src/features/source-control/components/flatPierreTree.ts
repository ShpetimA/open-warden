import type { FileTreeSortComparator } from "@pierre/trees";

import type { FileBrowserMode } from "@/features/source-control/types";

const INVISIBLE_INDEX_PREFIX = "\u2060";
const INVISIBLE_DIGIT_BY_DIGIT: Record<string, string> = {
  "0": "\u200b",
  "1": "\u200c",
  "2": "\u200d",
  "3": "\u2061",
  "4": "\u2062",
  "5": "\u2063",
  "6": "\u2064",
  "7": "\u180e",
  "8": "\ufeff",
  "9": "\u034f",
};
const DIGIT_BY_INVISIBLE_DIGIT = new Map(
  Object.entries(INVISIBLE_DIGIT_BY_DIGIT).map(([digit, invisibleDigit]) => [
    invisibleDigit,
    digit,
  ]),
);

export type DisplayFile<TSource = unknown> = {
  path: string;
  realPath: string;
  source: TSource;
};

export const compareFlatPierreEntries: FileTreeSortComparator = (left, right) => {
  return getFlatPierrePathIndex(left.path) - getFlatPierrePathIndex(right.path);
};

export function toDisplayPath(mode: FileBrowserMode, realPath: string, index: number): string {
  return mode === "list" ? toFlatPierreLeafPath(realPath, index) : realPath;
}

export function buildDisplayFiles<TSource extends { path: string }>(
  mode: FileBrowserMode,
  files: ReadonlyArray<TSource>,
  options?: {
    sort?: (left: TSource, right: TSource) => number;
  },
): Array<DisplayFile<TSource>> {
  const isList = mode === "list";
  const sorted = isList && options?.sort ? files.toSorted(options.sort) : [...files];

  return sorted.map((file, index) => ({
    path: toDisplayPath(mode, file.path, index),
    realPath: file.path,
    source: file,
  }));
}

export function toFlatPierreLeafPath(path: string, index: number) {
  const normalizedPath = path.replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const leafName = segments[segments.length - 1] ?? normalizedPath;
  const suffix = encodeInvisibleIndex(index);
  const extensionIndex = leafName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${leafName}${suffix}`;
  }

  return `${leafName.slice(0, extensionIndex)}${suffix}${leafName.slice(extensionIndex)}`;
}

export function getFlatPierrePathIndex(path: string) {
  const prefixIndex = path.indexOf(INVISIBLE_INDEX_PREFIX);
  if (prefixIndex < 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  let encodedIndex = "";
  for (const char of path.slice(prefixIndex + INVISIBLE_INDEX_PREFIX.length)) {
    const digit = DIGIT_BY_INVISIBLE_DIGIT.get(char);
    if (!digit) {
      break;
    }
    encodedIndex += digit;
  }

  const index = Number(encodedIndex);
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function encodeInvisibleIndex(index: number) {
  // In flat/list mode we display only the leaf name, but Pierre tree paths must remain unique.
  // Encode the original sorted index with invisible unicode chars before the extension so
  // duplicate basenames do not collide and sorting can recover the original list order.
  return `${INVISIBLE_INDEX_PREFIX}${String(index)
    .padStart(6, "0")
    .replace(/[0-9]/g, (digit) => INVISIBLE_DIGIT_BY_DIGIT[digit] ?? digit)}`;
}
