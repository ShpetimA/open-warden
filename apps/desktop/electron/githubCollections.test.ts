import { expect, test } from "vitest";
import { createGitHubCollectionReader } from "./githubCollections";

const file = (index: number) => ({
  filename: `file-${index}.ts`,
  status: "modified",
  additions: 1,
  deletions: 2,
});
const comment = (index: number) => ({
  id: index,
  body: `Comment ${index}`,
  created_at: "2026-10-30",
  updated_at: "2026-10-30",
  html_url: null,
  user: null,
});
const graphComment = (index: number) => ({
  id: `comment-${index}`,
  databaseId: index,
  body: `Reply ${index}`,
  createdAt: "2026-10-30",
  path: "file.ts",
  line: 1,
  startLine: null,
  author: null,
});
const page = (nodes: unknown[], cursor: string | null = null) => ({
  nodes,
  pageInfo: { hasNextPage: cursor !== null, endCursor: cursor },
});
const thread = (id: string, comments: unknown) => ({
  id,
  isResolved: false,
  isOutdated: false,
  path: "file.ts",
  line: 1,
  startLine: null,
  diffSide: "RIGHT",
  resolvedBy: null,
  comments,
});
function unexpected(): never {
  throw new Error("Unexpected provider read");
}

test("files and issue comments include every linked REST page", async () => {
  const requested: string[] = [];
  const reader = createGitHubCollectionReader({
    async rest(path) {
      requested.push(path);
      const second = path.includes("page=2");
      const files = path.includes("/files");
      return {
        data: Array.from({ length: second ? 3 : 100 }, (_, index) =>
          files ? file(index + (second ? 100 : 0)) : comment(index + (second ? 100 : 0)),
        ),
        headers: new Headers(
          second ? {} : { link: `<https://api.github.com${path}&page=2>; rel="next"` },
        ),
      };
    },
    graphql: unexpected,
  });
  expect(await reader.files("/repos/team/repo/pulls/1")).toHaveLength(103);
  expect(await reader.issueComments("/repos/team/repo/issues/1")).toHaveLength(103);
  expect(requested).toHaveLength(4);
});

test("threads and their nested replies are both fully paginated, with one dependent read at a time", async () => {
  const requested: Array<Record<string, unknown>> = [];
  const reader = createGitHubCollectionReader({
    rest: unexpected,
    async graphql(_query, variables) {
      requested.push(variables);
      if (variables.id === "thread-1")
        return { data: { node: { comments: page([graphComment(100)]) } } };
      const nodes =
        variables.after === null
          ? [
              thread(
                "thread-1",
                page(
                  Array.from({ length: 100 }, (_, index) => graphComment(index)),
                  "more-comments",
                ),
              ),
            ]
          : [thread("thread-2", page([graphComment(101)]))];
      return {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: page(nodes, variables.after === null ? "more-threads" : null),
            },
          },
        },
      };
    },
  });
  const threads = await reader.threads("team", "repo", 1);
  expect(threads).toHaveLength(2);
  expect(threads[0]?.comments.nodes).toHaveLength(101);
  expect(requested).toEqual([
    { owner: "team", repo: "repo", number: 1, after: null },
    { id: "thread-1", after: "more-comments" },
    { owner: "team", repo: "repo", number: 1, after: "more-threads" },
  ]);
});

test.each([
  "https://other.example/steal",
  "https://api.github.com/repos/other/repo/pulls/1/files",
  "https://api.github.com/repos/team/repo/pulls/1/files?per_page=100",
])("rejects an unsafe or repeated pagination link: %s", async (next) => {
  const requests: string[] = [];
  const reader = createGitHubCollectionReader({
    rest: async (path) => {
      requests.push(path);
      return { data: [file(1)], headers: new Headers({ link: `<${next}>; rel="next"` }) };
    },
    graphql: unexpected,
  });
  await expect(reader.files("/repos/team/repo/pulls/1")).rejects.toMatchObject({
    failure: { code: "unavailable" },
  });
  expect(requests).toHaveLength(1);
});

test("a missing continuation cursor or malformed later page never becomes a successful partial result", async () => {
  const reader = createGitHubCollectionReader({
    rest: unexpected,
    graphql: async () => ({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
          },
        },
      },
    }),
  });
  await expect(reader.threads("team", "repo", 1)).rejects.toMatchObject({
    failure: { code: "unavailable" },
  });
  const files = createGitHubCollectionReader({
    rest: async (path) => ({
      data: path.includes("page=2") ? [{ unexpected: true }] : [file(1)],
      headers: new Headers(
        path.includes("page=2")
          ? {}
          : { link: '<https://api.github.com/repos/team/repo/pulls/1/files?page=2>; rel="next"' },
      ),
    }),
    graphql: unexpected,
  });
  await expect(files.files("/repos/team/repo/pulls/1")).rejects.toMatchObject({
    failure: { code: "unavailable" },
  });
});

test("caller cancellation reaches the page reader and stops following pages", async () => {
  const controller = new AbortController();
  const signals: Array<AbortSignal | undefined> = [];
  const reader = createGitHubCollectionReader({
    async rest(_path, { signal }) {
      signals.push(signal);
      controller.abort();
      return {
        data: [file(1)],
        headers: new Headers({
          link: '<https://api.github.com/repos/team/repo/pulls/1/files?page=2>; rel="next"',
        }),
      };
    },
    graphql: unexpected,
  });
  await expect(
    reader.files("/repos/team/repo/pulls/1", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(signals).toHaveLength(1);
  expect(signals[0]?.aborted).toBe(true);
});

test("the files endpoint's hard cap cannot masquerade as a complete collection", async () => {
  const reader = createGitHubCollectionReader({
    rest: async (path) => ({
      data: path.includes("/files")
        ? Array.from({ length: 3000 }, (_, index) => file(index))
        : { changed_files: 3001 },
      headers: new Headers(),
    }),
    graphql: unexpected,
  });
  await expect(reader.files("/repos/team/repo/pulls/1")).rejects.toMatchObject({
    failure: { code: "unavailable" },
  });
});

test("issue comment reactions accept GitHub's URL and summary metadata", async () => {
  const reader = createGitHubCollectionReader({
    rest: async () => ({
      data: [
        {
          ...comment(1),
          reactions: { url: "https://api.github.com/reactions", total_count: 2, "+1": 2, heart: 0 },
        },
      ],
      headers: new Headers(),
    }),
    graphql: unexpected,
  });
  const comments = await reader.issueComments("/repos/team/repo/issues/1");
  expect(comments[0]?.reactions).toEqual({ "+1": 2, heart: 0 });
});
