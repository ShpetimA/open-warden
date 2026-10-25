import { useHotkey } from "@tanstack/react-hotkeys";
import {
  ChevronDown,
  GitPullRequest,
  Search,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import type { PullRequestPerson } from "@/platform/desktop";

import {
  pullRequestInvolvements,
  pullRequestStates,
  usePullRequestInboxFilters,
} from "./usePullRequestInboxFilters";

const involvementLabels: Record<(typeof pullRequestInvolvements)[number], string> = {
  all: "Everyone",
  "review-requested": "Needs my review",
  authored: "Mine",
  involved: "Involved",
};

const stateLabels: Record<(typeof pullRequestStates)[number], string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
  all: "All states",
};

function ChoiceFilter<T extends string>({
  label,
  options,
  labels,
  value,
  icon: Icon,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  icon: LucideIcon;
  onChange: (value: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-2 px-3"
          aria-label={`${label}: ${labels[value]}`}
        >
          <Icon className="text-muted-foreground size-4" />
          <span>{labels[value]}</span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel className="text-muted-foreground text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = options.find((candidate) => candidate === next);
            if (option !== undefined) onChange(option);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className="min-h-10 text-sm">
              {labels[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchField() {
  const [{ q }, setFilters] = usePullRequestInboxFilters();
  const [value, setValue] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(q);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (value.trim() !== q) setFilters({ q: value.trim() });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, setFilters, value]);

  useHotkey("/", (event) => {
    event.preventDefault();
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  return (
    <div className="relative min-w-48 flex-1 basis-64">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input
        ref={inputRef}
        aria-label="Search pull requests"
        placeholder="Search titles and descriptions"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (value) setValue("");
            else event.currentTarget.blur();
          }
        }}
        className="h-10 pr-8 pl-8 text-sm"
      />
      {value ? null : (
        <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
      )}
    </div>
  );
}

function AuthorFilter({ authors }: { authors: PullRequestPerson[] }) {
  const [{ author }, setFilters] = usePullRequestInboxFilters();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const suggestions = authors
    .filter(
      (person) =>
        !normalized ||
        person.login.toLowerCase().includes(normalized) ||
        person.displayName?.toLowerCase().includes(normalized),
    )
    .slice(0, 8);
  const selected = authors.find((person) => person.login === author);

  function choose(login: string) {
    setFilters({ author: login });
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-10 max-w-52 gap-2 px-3", author && "rounded-r-none border-r-0")}
            aria-label={author ? `Author: ${selected?.displayName ?? author}` : "Author: Anyone"}
          >
            {author ? (
              <UserAvatar
                login={author}
                name={selected?.displayName}
                avatarUrl={selected?.avatarUrl}
                size="xs"
              />
            ) : (
              <UserRound />
            )}
            <span className="truncate">
              {author ? (selected?.displayName ?? author) : "Author"}
            </span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim()) choose(query.trim());
            }}
          >
            <Input
              autoFocus
              aria-label="Author username"
              placeholder="Username"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 text-sm"
            />
          </form>
          <ul className="mt-1 flex flex-col">
            {suggestions.map((person) => (
              <li key={person.login}>
                <button
                  type="button"
                  onClick={() => choose(person.login)}
                  className="hover:bg-surface-1 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
                >
                  <UserAvatar
                    login={person.login}
                    name={person.displayName}
                    avatarUrl={person.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {person.displayName ?? person.login}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {suggestions.length === 0 ? (
            <p className="text-muted-foreground px-2 pt-2 text-xs">Press Enter to filter by it.</p>
          ) : null}
        </PopoverContent>
      </Popover>
      {author ? (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Clear author filter"
          className="h-10 w-10 rounded-l-none"
          onClick={() => setFilters({ author: "" })}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export function PullRequestInboxFilters({ authors }: { authors: PullRequestPerson[] }) {
  const [{ state, involvement }, setFilters] = usePullRequestInboxFilters();
  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <SearchField />
      <ChoiceFilter
        label="Whose pull requests"
        icon={UsersRound}
        options={pullRequestInvolvements}
        labels={involvementLabels}
        value={involvement}
        onChange={(next) => setFilters({ involvement: next })}
      />
      <ChoiceFilter
        label="Pull request state"
        icon={GitPullRequest}
        options={pullRequestStates}
        labels={stateLabels}
        value={state}
        onChange={(next) => setFilters({ state: next })}
      />
      <AuthorFilter authors={authors} />
    </div>
  );
}
