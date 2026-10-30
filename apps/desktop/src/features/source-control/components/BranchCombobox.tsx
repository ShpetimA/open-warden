import { useId, useState, type RefObject } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export function BranchCombobox({
  label,
  value,
  options,
  onChange,
  portalContainer,
  onOpenChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (branch: string) => void;
  portalContainer?: RefObject<HTMLDivElement | null>;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");

  const query = search.trim().toLocaleLowerCase();
  const filtered =
    search === value
      ? options
      : options.filter((branch) => branch.toLocaleLowerCase().includes(query));

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-[0.12em] uppercase"
      >
        {label}
      </label>
      <Combobox
        items={options}
        filteredItems={filtered}
        onInputValueChange={setSearch}
        value={value || null}
        autoHighlight
        onOpenChange={onOpenChange}
        onValueChange={(branch) => {
          if (branch) onChange(branch);
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={`${label} branch`}
          placeholder="Search branches…"
          className="h-7 w-full [&_input]:min-w-0 [&_input]:px-2 [&_input]:text-xs"
        />
        <ComboboxContent
          container={portalContainer}
          className="min-w-72 max-w-[min(36rem,calc(100vw-24px))]"
        >
          <ComboboxEmpty className="text-xs">No branches found.</ComboboxEmpty>
          <ComboboxList>
            {(branch: string) => (
              <ComboboxItem key={branch} value={branch} className="text-xs">
                <span className="min-w-0 break-all">{branch}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
