import { useHotkey } from "@tanstack/react-hotkeys";
import { ChevronDown, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
  all: "All",
};

function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="bg-surface-1 flex rounded-md p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "text-muted-foreground hover:text-foreground h-7 rounded-[5px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === option && "bg-background text-foreground shadow-xs",
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function SearchField() {
  const [{ q }, setFilters] = usePullRequestInboxFilters();
  const [value, setValue] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="relative min-w-[220px] flex-1">
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
        className="h-8 pr-8 pl-8 text-sm"
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
            className={cn("gap-1.5", author && "rounded-r-none border-r-0")}
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
            {author ? (selected?.displayName ?? author) : "Author"}
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
                  className="hover:bg-surface-1 flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
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
          className="rounded-l-none"
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
      <Segmented
        label="Whose pull requests"
        options={pullRequestInvolvements}
        labels={involvementLabels}
        value={involvement}
        onChange={(next) => setFilters({ involvement: next })}
      />
      <Segmented
        label="Pull request state"
        options={pullRequestStates}
        labels={stateLabels}
        value={state}
        onChange={(next) => setFilters({ state: next })}
      />
      <AuthorFilter authors={authors} />
    </div>
  );
}
