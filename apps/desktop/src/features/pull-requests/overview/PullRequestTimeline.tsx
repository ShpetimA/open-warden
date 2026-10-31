import { useHotkey } from "@tanstack/react-hotkeys";
import {
  CircleCheck,
  CircleX,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Tag,
  UserMinus,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";

import { MarkdownEditor, type MentionConfig } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  appendQuotedBody,
  CommentBody,
  copyToClipboard,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { cn } from "@/lib/utils";

import { buildTimeline } from "./timeline";
import { useTimelineScrollAnchor } from "./useTimelineScrollAnchor";
import type { PersonView, TimelineEntry, TimelineEventKind, TimelineItem } from "./types";

const COLLAPSED_BOT_BODY_LENGTH = 280;

type ComposerHandle = { quote: (body: string) => void };

function displayName(person: PersonView | null) {
  return person ? (person.name ?? person.login) : "Someone";
}

function isBot(person: PersonView) {
  return Boolean(person.isBot) || person.login.endsWith("[bot]");
}

/** A comment card on the timeline rail: avatar outside, header strip, markdown body. */
export function TimelineComment({
  author,
  createdAt,
  body,
  url,
  isPullRequestAuthor = false,
  badge,
  tone = "default",
  onQuote,
  onEdit,
  children,
  defaultExpanded = false,
}: {
  author: PersonView;
  createdAt: string;
  body: string;
  url?: string | null;
  isPullRequestAuthor?: boolean;
  badge?: ReactNode;
  tone?: "default" | "approved" | "changes";
  onQuote?: (body: string) => void;
  onEdit?: () => void;
  children?: ReactNode;
  defaultExpanded?: boolean;
}) {
  const bot = isBot(author);
  const [expanded, setExpanded] = useState(
    defaultExpanded || !bot || body.length <= COLLAPSED_BOT_BODY_LENGTH,
  );
  return (
    <div className="relative flex gap-3">
      <UserAvatar
        login={author.login}
        name={author.name}
        avatarUrl={author.avatarUrl}
        isBot={bot}
        className="relative z-10 mt-1"
      />
      <article
        className={cn(
          "bg-surface-0 min-w-0 flex-1 overflow-hidden rounded-lg border",
          tone === "approved" && "border-success-border",
          tone === "changes" && "border-destructive-border",
        )}
      >
        <header className="border-border/70 bg-surface-1/60 flex min-h-9 flex-wrap items-center gap-x-2 border-b px-3 text-xs">
          <span className="text-foreground font-semibold">{displayName(author)}</span>
          {bot ? (
            <StatusBadge size="sm" showDot={false}>
              Bot
            </StatusBadge>
          ) : null}
          {isPullRequestAuthor ? (
            <StatusBadge size="sm" showDot={false} tone="info">
              Author
            </StatusBadge>
          ) : null}
          {badge}
          <RelativeTime value={createdAt} className="text-muted-foreground" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label="Comment actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {url ? (
                <DropdownMenuItem onSelect={() => void copyToClipboard(url, "Link copied")}>
                  Copy link
                </DropdownMenuItem>
              ) : null}
              {onQuote ? (
                <DropdownMenuItem onSelect={() => onQuote(body)}>Quote reply</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => void copyToClipboard(body, "Comment copied")}>
                Copy text
              </DropdownMenuItem>
              {onEdit ? <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className={cn("relative px-4 py-3", !expanded && "max-h-28 overflow-hidden")}>
          <CommentBody body={body} defaultExpanded={defaultExpanded} />
          {!expanded ? (
            <div className="from-surface-0 via-surface-0/90 absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t to-transparent pb-2">
              <Button variant="outline" size="xs" onClick={() => setExpanded(true)}>
                Show full comment
              </Button>
            </div>
          ) : null}
        </div>
        {children}
      </article>
    </div>
  );
}

const eventMeta: Record<
  TimelineEventKind,
  { icon: LucideIcon; text: (count: number, detail: string | null) => ReactNode }
> = {
  "review-requested": {
    icon: UserPlus,
    text: (_, detail) => (detail ? `requested a review from ${detail}` : "requested a review"),
  },
  "review-request-removed": {
    icon: UserMinus,
    text: (_, detail) => (detail ? `removed ${detail} from the review` : "removed a reviewer"),
  },
  "force-pushed": {
    icon: GitBranch,
    text: (count) =>
      count > 1 ? `force-pushed the branch ${count} times` : "force-pushed the branch",
  },
  ready: { icon: Eye, text: () => "marked this ready for review" },
  draft: { icon: GitPullRequestDraft, text: () => "converted this to a draft" },
  merged: { icon: GitMerge, text: () => "merged this pull request" },
  closed: { icon: GitPullRequestClosed, text: () => "closed this pull request" },
  reopened: { icon: RefreshCw, text: () => "reopened this pull request" },
  renamed: {
    icon: Pencil,
    text: (_, detail) => (detail ? `renamed this: ${detail}` : "renamed this"),
  },
  edited: {
    icon: Pencil,
    text: (count) =>
      count > 1 ? `edited the description ${count} times` : "edited the description",
  },
  labeled: { icon: Tag, text: (_, detail) => `added the ${detail ?? ""} label` },
  unlabeled: { icon: Tag, text: (_, detail) => `removed the ${detail ?? ""} label` },
  assigned: { icon: UserPlus, text: () => "was assigned" },
  unassigned: { icon: UserMinus, text: () => "was unassigned" },
  "auto-merge-enabled": { icon: Zap, text: () => "enabled auto-merge" },
  "auto-merge-disabled": { icon: Zap, text: () => "disabled auto-merge" },
};

/** A single quiet line on the rail for anything that is not a conversation. */
export function TimelineEvent({
  icon: Icon,
  actor,
  children,
  at,
  iconClassName,
}: {
  icon: LucideIcon;
  actor: PersonView | null;
  children: ReactNode;
  at: string;
  iconClassName?: string;
}) {
  return (
    <div className="text-muted-foreground flex min-h-8 items-center gap-3 pl-1.5 text-xs">
      <span className="bg-background relative z-10 flex size-4 shrink-0 items-center justify-center">
        <Icon className={cn("size-4", iconClassName)} />
      </span>
      {actor ? (
        <UserAvatar login={actor.login} name={actor.name} avatarUrl={actor.avatarUrl} size="xs" />
      ) : null}
      <span className="min-w-0">
        <span className="text-foreground font-medium">{displayName(actor)}</span> {children}
      </span>
      <RelativeTime value={at} className="shrink-0" />
    </div>
  );
}

function CommitGroup({
  item,
  onOpenCommit,
}: {
  item: Extract<TimelineItem, { kind: "commits" }>;
  onOpenCommit?: (sha: string) => void;
}) {
  const [open, setOpen] = useState(item.commits.length <= 3);
  return (
    <div>
      <TimelineEvent icon={GitCommitHorizontal} actor={item.author} at={item.createdAt}>
        pushed {item.commits.length} commit{item.commits.length === 1 ? "" : "s"}
        {item.commits.length > 3 ? (
          <button
            type="button"
            className="text-foreground ml-1.5 underline-offset-2 hover:underline"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "hide" : "show"}
          </button>
        ) : null}
      </TimelineEvent>
      {open ? (
        <ul className="ml-10 flex flex-col pb-1">
          {item.commits.map((commit) => (
            <li key={commit.id} className="flex min-h-6 items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{commit.message}</span>
              <button
                type="button"
                disabled={!onOpenCommit}
                title="Open in History"
                onClick={() => onOpenCommit?.(commit.sha)}
                className="text-muted-foreground hover:text-foreground font-mono text-[11px] hover:underline"
              >
                {commit.sha.slice(0, 7)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  pullRequestAuthor,
  onQuote,
  onOpenCommit,
}: {
  item: TimelineItem;
  pullRequestAuthor: string;
  onQuote: (body: string) => void;
  onOpenCommit?: (sha: string) => void;
}) {
  switch (item.kind) {
    case "comment":
      return (
        <TimelineComment
          author={item.author}
          createdAt={item.createdAt}
          body={item.body}
          url={item.url}
          isPullRequestAuthor={item.author.login === pullRequestAuthor}
          onQuote={onQuote}
        >
          {item.footer}
        </TimelineComment>
      );
    case "review": {
      const approved = item.state === "approved";
      const changes = item.state === "changes-requested";
      const verb = approved ? "approved these changes" : changes ? "requested changes" : "reviewed";
      return item.body.trim() ? (
        <TimelineComment
          author={item.author}
          createdAt={item.createdAt}
          body={item.body}
          tone={approved ? "approved" : changes ? "changes" : "default"}
          badge={<span className="text-muted-foreground">{verb}</span>}
          onQuote={onQuote}
        />
      ) : (
        <TimelineEvent
          icon={approved ? CircleCheck : changes ? CircleX : MessageSquare}
          iconClassName={approved ? "text-success" : changes ? "text-destructive" : undefined}
          actor={item.author}
          at={item.createdAt}
        >
          {verb}
        </TimelineEvent>
      );
    }
    case "commits":
      return <CommitGroup item={item} onOpenCommit={onOpenCommit} />;
    case "event": {
      const meta = eventMeta[item.event];
      return (
        <TimelineEvent icon={meta.icon} actor={item.actor} at={item.lastAt}>
          {meta.text(item.count, item.detail)}
        </TimelineEvent>
      );
    }
    case "custom":
      return <div className="relative z-10 pl-10">{item.node}</div>;
  }
}

export function PullRequestCommentComposer({
  viewer,
  mentions,
  onSubmit,
  ref,
}: {
  viewer: PersonView | null;
  mentions?: MentionConfig;
  onSubmit: (body: string) => Promise<boolean>;
  ref?: Ref<ComposerHandle>;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    quote(body) {
      setValue((current) => appendQuotedBody(current, body));
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
  }));

  async function submit() {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    const posted = await onSubmit(value);
    setSubmitting(false);
    if (posted) setValue("");
  }

  useHotkey(
    "Mod+Enter",
    (event) => {
      event.preventDefault();
      void submit();
    },
    { target: textareaRef, ignoreInputs: false },
  );

  return (
    <div className="flex gap-3">
      {viewer ? (
        <UserAvatar
          login={viewer.login}
          name={viewer.name}
          avatarUrl={viewer.avatarUrl}
          className="relative z-10 mt-1"
        />
      ) : (
        <span className="size-7 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <MarkdownEditor
          value={value}
          onChange={setValue}
          placeholder="Add a comment… Markdown and @mentions supported"
          textareaRef={textareaRef}
          mentions={mentions}
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <span className="text-muted-foreground mr-auto pl-1 text-[11px]">⌘↵ to comment</span>
          <Button size="sm" disabled={!value.trim() || submitting} onClick={() => void submit()}>
            {submitting ? "Commenting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The whole conversation on one rail: description, comments, reviews, threads, pushes, events. */
export function PullRequestTimeline({
  description,
  entries,
  viewer,
  mentions,
  onOpenCommit,
  onSubmitComment,
  onEditDescription,
  composerReady = true,
}: {
  description: { author: PersonView; createdAt: string; body: string };
  entries: TimelineEntry[];
  viewer: PersonView | null;
  mentions?: MentionConfig;
  onOpenCommit?: (sha: string) => void;
  onSubmitComment: (body: string) => Promise<boolean>;
  onEditDescription?: () => void;
  composerReady?: boolean;
}) {
  const composerRef = useRef<ComposerHandle>(null);
  const rootRef = useTimelineScrollAnchor(entries);
  const items = buildTimeline(entries);
  const quote = (body: string) => composerRef.current?.quote(body);
  return (
    <div ref={rootRef} data-slot="pr-timeline" className="relative flex min-w-0 flex-col gap-4">
      <div aria-hidden="true" className="bg-border absolute top-4 bottom-4 left-[13px] w-px" />
      <div data-timeline-anchor="description">
        <TimelineComment
          author={description.author}
          createdAt={description.createdAt}
          body={description.body.trim() || "_No description provided._"}
          isPullRequestAuthor
          defaultExpanded
          badge={<span className="text-muted-foreground">opened this pull request</span>}
          onQuote={composerReady ? quote : undefined}
          onEdit={onEditDescription}
        />
      </div>
      {items.map((item) => (
        <div key={item.id} data-timeline-anchor={item.id}>
          <TimelineRow
            item={item}
            pullRequestAuthor={description.author.login}
            onQuote={quote}
            onOpenCommit={onOpenCommit}
          />
        </div>
      ))}
      {composerReady ? (
        <div data-timeline-anchor="composer">
          <PullRequestCommentComposer
            ref={composerRef}
            viewer={viewer}
            mentions={mentions}
            onSubmit={onSubmitComment}
          />
        </div>
      ) : null}
    </div>
  );
}
