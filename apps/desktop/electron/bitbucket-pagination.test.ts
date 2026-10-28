import { expect, it } from "vitest";
import { collectBitbucketPages } from "./bitbucket-pagination";

it("returns every changed file beyond thirty Bitbucket pages", async () => {
  const result = await collectBitbucketPages(
    "/repositories/team/app/pullrequests/2984/diffstat?pagelen=100",
    async (url) => {
      const page = Number(new URL(url).searchParams.get("page") ?? 1);
      return {
        values: Array.from({ length: 100 }, (_, index) => ({
          path: page === 35 && index === 99 ? "apps/mobile/app.config.ts" : `file-${page}-${index}`,
        })),
        next:
          page < 35
            ? `https://api.bitbucket.org/2.0/repositories/team/app/pullrequests/2984/diffstat?pagelen=100&page=${page + 1}`
            : undefined,
      };
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected complete results");
  expect(result.values).toHaveLength(3500);
  expect(result.values.at(-1)?.path).toBe("apps/mobile/app.config.ts");
});

it("reports a repeated page instead of returning a partial file list", async () => {
  const result = await collectBitbucketPages("/repositories/team/app/diffstat", async (url) => ({
    values: ["first file"],
    next: url,
  }));

  expect(result).toMatchObject({ ok: false, error: { code: "repeated-page" } });
});

it("rejects a pagination link to another origin before requesting it", async () => {
  const requested: string[] = [];
  const result = await collectBitbucketPages("/repositories/team/app/diffstat", async (url) => {
    requested.push(url);
    return { values: ["first file"], next: "https://other.example/results" };
  });

  expect(result).toMatchObject({ ok: false, error: { code: "invalid-page" } });
  expect(requested).toEqual(["https://api.bitbucket.org/2.0/repositories/team/app/diffstat"]);
});

it("preserves a later request failure instead of reporting partial success", async () => {
  const cause = new Error("Bitbucket is unavailable");
  const result = await collectBitbucketPages("/repositories/team/app/diffstat", async (url) => {
    if (url.includes("page=2")) throw cause;
    return { values: ["first file"], next: `${url}?page=2` };
  });

  expect(result).toEqual({ ok: false, error: { code: "request", cause } });
});
