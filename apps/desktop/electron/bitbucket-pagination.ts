export type BitbucketPage<T> = {
  values: T[];
  next?: string;
};

type PaginationFailure =
  | { code: "invalid-page"; message: string }
  | { code: "repeated-page"; message: string }
  | { code: "request"; cause: unknown };

type PaginationResult<T> = { ok: true; values: T[] } | { ok: false; error: PaginationFailure };

const apiBase = "https://api.bitbucket.org/2.0";

export async function collectBitbucketPages<T>(
  firstPath: string,
  readPage: (url: string) => Promise<BitbucketPage<T>>,
): Promise<PaginationResult<T>> {
  const values: T[] = [];
  const visited = new Set<string>();
  let next: string | undefined = firstPath;

  while (next) {
    let url: URL;
    try {
      url = new URL(next.startsWith("/") ? `${apiBase}${next}` : next);
    } catch {
      return {
        ok: false,
        error: { code: "invalid-page", message: "Bitbucket returned an invalid pagination link." },
      };
    }

    if (
      url.origin !== "https://api.bitbucket.org" ||
      !url.pathname.startsWith("/2.0/") ||
      url.username ||
      url.password
    ) {
      return {
        ok: false,
        error: { code: "invalid-page", message: "Bitbucket returned an invalid pagination link." },
      };
    }

    const key = url.href;
    if (visited.has(key)) {
      return {
        ok: false,
        error: { code: "repeated-page", message: "Bitbucket returned a repeated results page." },
      };
    }
    visited.add(key);

    try {
      const page = await readPage(key);
      values.push(...page.values);
      next = page.next?.trim() || undefined;
    } catch (cause) {
      return { ok: false, error: { code: "request", cause } };
    }
  }

  return { ok: true, values };
}
