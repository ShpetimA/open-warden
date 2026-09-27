import { Fragment, useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { Archive, ArrowRight, GitBranch, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

import { actions, stashActions } from "./commandComposerModel";
import type { ComposerAction } from "./commandComposerModel";

export type ComposerChoice = {
  id: string;
  label: string;
  detail: string;
  icon?: LucideIcon;
  disabled?: boolean;
  section?: string;
};

type Props = {
  pane: "action" | "choice";
  action: ComposerAction | null;
  operandLabel: string;
  choiceSearchLabel: string;
  query: string;
  choices: ComposerChoice[];
  matchingCount: number;
  activeChoiceId?: string;
  busy: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onHighlight: (id: string) => void;
  onSelect: (id: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  choiceIcon?: LucideIcon;
  onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function CommandComposerChoiceStep({
  pane,
  action,
  operandLabel,
  choiceSearchLabel,
  query,
  choices,
  matchingCount,
  activeChoiceId,
  busy,
  searchRef,
  onQueryChange,
  onHighlight,
  onSelect,
  searchPlaceholder,
  searchLabel,
  choiceIcon,
  onSearchKeyDown,
}: Props) {
  const choicesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    choicesRef.current
      ?.querySelector<HTMLElement>('.change-composer-choice[data-highlighted="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeChoiceId, choices.length]);

  return (
    <>
      <div className="change-composer-search">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <Input
          ref={searchRef}
          aria-label={
            searchLabel ?? (pane === "action" ? "Search actions" : `Search ${choiceSearchLabel}`)
          }
          className="h-9 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          placeholder={
            searchPlaceholder ??
            (pane === "action" ? "Search actions…" : `Search ${choiceSearchLabel}…`)
          }
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />
      </div>
      <div
        ref={choicesRef}
        className="change-composer-choices"
        role="group"
        aria-label={pane === "action" ? "Actions" : operandLabel}
      >
        {choices.length ? (
          choices.map((choice, index) => {
            const info = pane === "action" ? actions.find((item) => item.id === choice.id) : null;
            const Icon =
              choice.icon ??
              info?.icon ??
              choiceIcon ??
              (action && stashActions.has(action) ? Archive : GitBranch);
            const showSection = choice.section && choice.section !== choices[index - 1]?.section;
            return (
              <Fragment key={choice.id}>
                {showSection ? (
                  <p className="change-composer-choice-section">{choice.section}</p>
                ) : null}
                <button
                  type="button"
                  className="change-composer-choice"
                  data-highlighted={activeChoiceId === choice.id}
                  onFocus={() => onHighlight(choice.id)}
                  onMouseEnter={() => onHighlight(choice.id)}
                  onClick={() => onSelect(choice.id)}
                  disabled={choice.disabled || busy}
                >
                  <span className="change-composer-choice-icon" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{choice.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {choice.detail}
                    </span>
                  </span>
                  <ArrowRight
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                </button>
              </Fragment>
            );
          })
        ) : (
          <p className="text-muted-foreground px-2 py-4 text-sm">
            {query
              ? pane === "action"
                ? "No matching actions."
                : "No matching choices."
              : pane === "action"
                ? "No actions available."
                : "No choices available."}
          </p>
        )}
        {matchingCount > choices.length ? (
          <p className="text-muted-foreground px-2 py-1 text-xs">
            Showing the first 50. Type to narrow the list.
          </p>
        ) : null}
      </div>
    </>
  );
}
