import { toast } from "sonner";

import type {
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestReviewComment,
  PullRequestReviewThread,
} from "@/platform/desktop";

export function toDisplayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function quoteMarkdown(body: string) {
  return `${body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}\n\n`;
}

export function appendQuotedBody(current: string, body: string) {
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n\n" : "";
  return `${current}${separator}${quoteMarkdown(body)}`;
}

function commentAuthor(comment: PullRequestIssueComment | PullRequestReviewComment) {
  return authorLabel(comment.author?.login ?? null, comment.author?.displayName ?? null);
}

function formatRemoteIssueComment(comment: PullRequestIssueComment) {
  return [`- ${commentAuthor(comment)} · ${toDisplayDate(comment.createdAt)}`, comment.body].join(
    "\n",
  );
}

function formatRemoteReviewThread(thread: PullRequestReviewThread) {
  const lineLabel = thread.line ?? thread.startLine ?? "Unknown line";
  const threadHeader = `- ${thread.path}:${String(lineLabel)}${thread.isResolved ? " · resolved" : ""}`;
  const commentBlocks = thread.comments
    .map((comment) =>
      [
        `  - ${commentAuthor(comment)} · ${toDisplayDate(comment.createdAt)}`,
        `    ${comment.body.split("\n").join("\n    ")}`,
      ].join("\n"),
    )
    .join("\n");

  return [threadHeader, commentBlocks].filter(Boolean).join("\n");
}

export function buildRemoteCommentsPayload(conversation: PullRequestConversation) {
  const sections: string[] = [];

  if (conversation.detail.body.trim()) {
    sections.push(`# ${conversation.detail.title}`);
    sections.push("");
    sections.push(conversation.detail.body.trim());
    sections.push("");
  }

  if (conversation.issueComments.length > 0) {
    sections.push("Issue comments");
    sections.push(
      conversation.issueComments.map((comment) => formatRemoteIssueComment(comment)).join("\n\n"),
    );
    sections.push("");
  }

  if (conversation.reviewThreads.length > 0) {
    sections.push("Review threads");
    sections.push(
      conversation.reviewThreads.map((thread) => formatRemoteReviewThread(thread)).join("\n\n"),
    );
  }

  return sections.join("\n").trim();
}

export function authorLabel(login: string | null, displayName: string | null) {
  if (displayName && displayName !== login) {
    return `${displayName} (${login})`;
  }

  return login ?? "Unknown author";
}

export function CommentBody({ body }: { body: string }) {
  return (
    <div className="text-foreground/90 whitespace-pre-wrap break-words text-[13px] leading-5">
      {body}
    </div>
  );
}

export function Avatar({ login, avatarUrl }: { login: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        alt={login ?? "User avatar"}
        src={avatarUrl}
        className="h-7 w-7 rounded-full border border-white/10 object-cover"
      />
    );
  }

  return (
    <div className="bg-background text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-[10px] font-semibold uppercase">
      {(login ?? "?").slice(0, 2)}
    </div>
  );
}

export async function copyToClipboard(value: string, successMessage: string) {
  await navigator.clipboard.writeText(value);
  toast.success(successMessage);
}

export async function copyRemoteCommentsToClipboard(conversation: PullRequestConversation) {
  const payload = buildRemoteCommentsPayload(conversation);
  if (!payload) {
    toast.info("No remote comments to copy");
    return;
  }

  try {
    await navigator.clipboard.writeText(payload);
    toast.success("Remote comments copied");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to copy remote comments");
  }
}
