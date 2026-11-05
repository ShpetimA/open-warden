import { WeightedLruCache } from "@/features/diff-view/services/weightedLruCache";

type HighlightOptions = {
  readonly maxEntries: number;
  readonly maxBytes: number;
};

export function createHighlightCache(
  render: (code: string, language: string) => Promise<string>,
  options: HighlightOptions = { maxEntries: 128, maxBytes: 16 * 1024 * 1024 },
) {
  const cache = new WeightedLruCache<string, Promise<string>>({
    maxEntries: options.maxEntries,
    maxWeight: options.maxBytes,
  });

  return function highlight(code: string, language: string): Promise<string> {
    const key = `${language}:${code}`;
    const retained = cache.get(key);
    if (retained) return retained;

    const sourceBytes = key.length * 2;
    const pending = Promise.resolve().then(() => render(code, language));
    const result = pending.then(
      (html) => {
        if (cache.peek(key) === result) cache.set(key, result, sourceBytes + html.length * 2);
        return html;
      },
      (cause: unknown) => {
        if (cache.peek(key) === result) cache.delete(key);
        throw cause;
      },
    );

    cache.set(key, result, sourceBytes);

    return result;
  };
}
