import { z } from "zod";
import { DesktopAdapterError } from "./desktop-failure";
import { desktopFailure } from "../src/platform/desktop/failure";

const user = z.object({ login: z.string(), avatar_url: z.string().nullable() }).nullable();
const graphUser = z.object({ login: z.string(), avatarUrl: z.string().nullable() }).nullable();
const fileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().nullish(),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
const issueCommentSchema = z.object({
  id: z.number().int(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string().nullable(),
  user,
  reactions: z
    .object({
      "+1": z.number().int().nonnegative().optional(),
      "-1": z.number().int().nonnegative().optional(),
      laugh: z.number().int().nonnegative().optional(),
      hooray: z.number().int().nonnegative().optional(),
      confused: z.number().int().nonnegative().optional(),
      heart: z.number().int().nonnegative().optional(),
      rocket: z.number().int().nonnegative().optional(),
      eyes: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const threadCommentSchema = z.object({
  id: z.string(),
  databaseId: z.number().int(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullish(),
  path: z.string(),
  line: z.number().int().nullable(),
  startLine: z.number().int().nullable(),
  url: z.string().nullish(),
  author: graphUser,
});
const commentsSchema = z.object({ nodes: z.array(threadCommentSchema), pageInfo });
const threadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string(),
  line: z.number().int().nullable(),
  startLine: z.number().int().nullable(),
  diffSide: z.enum(["LEFT", "RIGHT"]).nullable(),
  resolvedBy: graphUser,
  comments: commentsSchema,
});
const threadsSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({ nodes: z.array(threadSchema), pageInfo }),
      }),
    }),
  }),
});
const nextCommentsSchema = z.object({
  data: z.object({ node: z.object({ comments: commentsSchema }) }),
});
type ReadOptions = { readonly signal?: AbortSignal };
type Reads = {
  rest(path: string, options: ReadOptions): Promise<{ data: unknown; headers: Headers }>;
  graphql(
    query: string,
    variables: Record<string, unknown>,
    options: ReadOptions,
  ): Promise<unknown>;
};
const readTimeoutMs = 60_000;
const filesEndpointLimit = 3_000;
const commentFields = `id databaseId body createdAt updatedAt path line startLine url author { login avatarUrl }`;
const threadsQuery = `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
    reviewThreads(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id isResolved isOutdated path line startLine diffSide resolvedBy { login avatarUrl }
        comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${commentFields} } }
      }
    }
  } }
}`;
const commentsQuery = `query($id: ID!, $after: String!) {
  node(id: $id) { ... on PullRequestReviewThread {
    comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${commentFields} } }
  } }
}`;

function incomplete(): never {
  throw new DesktopAdapterError(
    desktopFailure(
      "github.collections",
      "unavailable",
      "GitHub returned an incomplete or unreadable collection. Refresh before relying on these results.",
    ),
  );
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : incomplete();
}
function signalForRead(options: ReadOptions): AbortSignal {
  const timeout = AbortSignal.timeout(readTimeoutMs);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}
function cursorAfter(info: z.infer<typeof pageInfo>, visited: Set<string>): string | null {
  if (!info.hasNextPage) return null;
  if (!info.endCursor || visited.has(info.endCursor)) return incomplete();
  visited.add(info.endCursor);
  return info.endCursor;
}

export function createGitHubCollectionReader(reads: Reads) {
  async function restPages<T>(
    first: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T[]> {
    const firstUrl = new URL(first, "https://api.github.com");
    const visited = new Set<string>();
    const values: T[] = [];
    let next: URL | null = firstUrl;
    while (next) {
      signal.throwIfAborted();
      if (
        next.origin !== "https://api.github.com" ||
        next.pathname !== firstUrl.pathname ||
        next.username ||
        next.password ||
        visited.has(next.href)
      )
        incomplete();
      visited.add(next.href);
      const page = await reads.rest(`${next.pathname}${next.search}`, { signal });
      values.push(...parse(z.array(schema), page.data));
      const links = page.headers.get("link") ?? "";
      const link = /<([^>]+)>;\s*rel="next"/.exec(links);
      if (links.includes('rel="next"') && !link) incomplete();
      if (!link) next = null;
      else {
        try {
          next = new URL(link[1]!, firstUrl);
        } catch {
          incomplete();
        }
      }
    }
    return values;
  }

  return {
    async files(basePath: string, options: ReadOptions = {}) {
      const signal = signalForRead(options);
      const files = await restPages(`${basePath}/files?per_page=100`, fileSchema, signal);
      if (files.length >= filesEndpointLimit) {
        const detail = await reads.rest(basePath, { signal });
        const total = parse(
          z.object({ changed_files: z.number().int().nonnegative() }),
          detail.data,
        );
        if (total.changed_files !== files.length) incomplete();
      }
      return files;
    },
    issueComments(basePath: string, options: ReadOptions = {}) {
      return restPages(
        `${basePath}/comments?per_page=100`,
        issueCommentSchema,
        signalForRead(options),
      );
    },
    async threads(owner: string, repo: string, number: number, options: ReadOptions = {}) {
      const signal = signalForRead(options);
      const threads: z.infer<typeof threadSchema>[] = [];
      const visited = new Set<string>();
      let after: string | null = null;
      do {
        signal.throwIfAborted();
        const page = parse(
          threadsSchema,
          await reads.graphql(threadsQuery, { owner, repo, number, after }, { signal }),
        ).data.repository.pullRequest.reviewThreads;
        for (const thread of page.nodes) {
          const comments = thread.comments.nodes;
          const commentCursors = new Set<string>();
          let commentAfter = cursorAfter(thread.comments.pageInfo, commentCursors);
          while (commentAfter !== null) {
            signal.throwIfAborted();
            const more = parse(
              nextCommentsSchema,
              await reads.graphql(
                commentsQuery,
                { id: thread.id, after: commentAfter },
                { signal },
              ),
            ).data.node.comments;
            comments.push(...more.nodes);
            commentAfter = cursorAfter(more.pageInfo, commentCursors);
          }
          threads.push(thread);
        }
        after = cursorAfter(page.pageInfo, visited);
      } while (after !== null);
      return threads;
    },
  };
}
