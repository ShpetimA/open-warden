import { useSearchParams } from "react-router";

export const pullRequestStates = ["open", "merged", "closed", "all"] as const;
export const pullRequestInvolvements = ["all", "review-requested", "authored", "involved"] as const;

export type PullRequestInboxFilters = {
  q: string;
  state: (typeof pullRequestStates)[number];
  involvement: (typeof pullRequestInvolvements)[number];
  author: string;
};

const defaults: PullRequestInboxFilters = { q: "", state: "open", involvement: "all", author: "" };

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return values.find((candidate) => candidate === value) ?? fallback;
}

/**
 * The inbox filters live in the route's query so a filtered list survives navigation and
 * reloads. They go through the router rather than nuqs, whose adapter writes the query outside
 * the hash route.
 */
export function usePullRequestInboxFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters: PullRequestInboxFilters = {
    q: searchParams.get("q") ?? defaults.q,
    state: oneOf(pullRequestStates, searchParams.get("state"), defaults.state),
    involvement: oneOf(
      pullRequestInvolvements,
      searchParams.get("involvement"),
      defaults.involvement,
    ),
    author: searchParams.get("author") ?? defaults.author,
  };

  function setFilters(changes: Partial<PullRequestInboxFilters>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === defaults[key as keyof PullRequestInboxFilters]) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  return [filters, setFilters] as const;
}
