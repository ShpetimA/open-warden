import { useMemo, useState } from "react";

import type { MentionCandidate } from "@/components/markdown/MarkdownEditor";
import type { PullRequestConversation, PullRequestPerson } from "@/platform/desktop";

function addCandidate(
  user: PullRequestPerson | null | undefined,
  seen: Set<string>,
  candidates: MentionCandidate[],
) {
  const login = user?.login?.trim();
  if (!login || seen.has(login)) {
    return;
  }

  seen.add(login);
  candidates.push({
    id: login,
    label: login,
    avatarUrl: user?.avatarUrl ?? undefined,
  });
}

export function usePullRequestMentionCandidates(conversation: PullRequestConversation | null) {
  const [activated, setActivated] = useState(false);

  const candidates = useMemo(() => {
    if (!conversation || !activated) {
      return [] as MentionCandidate[];
    }

    const seen = new Set<string>();
    const next: MentionCandidate[] = [];

    addCandidate(conversation.detail.author, seen, next);

    for (const comment of conversation.issueComments) {
      addCandidate(comment.author, seen, next);
    }

    for (const thread of conversation.reviewThreads) {
      addCandidate(thread.resolvedBy, seen, next);
      for (const comment of thread.comments) {
        addCandidate(comment.author, seen, next);
      }
    }

    return next;
  }, [activated, conversation]);

  return {
    candidates,
    isLoading: false,
    onActivate: () => {
      setActivated(true);
    },
  };
}
