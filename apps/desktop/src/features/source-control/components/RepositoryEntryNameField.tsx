import { useEffect, type RefObject } from "react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function RepositoryEntryNameField({
  inputRef,
  prefix,
  value,
  busy,
  error,
  onChange,
  onSubmit,
  onCancel,
  onLeave,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  prefix: string;
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);
  return (
    <form
      style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Tab") {
          onLeave();
        }
      }}
    >
      <Input
        ref={inputRef}
        aria-label="New file or folder"
        aria-description={
          error ??
          `Relative to ${prefix || "repository root"}. End with / for a folder. Enter to create, Escape to cancel.`
        }
        aria-invalid={Boolean(error)}
        aria-busy={busy}
        value={value}
        placeholder="Name"
        title={error ?? `Create in ${prefix || "repository root"}`}
        autoComplete="off"
        spellCheck={false}
        readOnly={busy}
        onChange={(event) => onChange(event.target.value)}
        style={{
          height: 20,
          minWidth: 0,
          width: "100%",
          padding: "0 4px",
          borderRadius: 2,
          border: `1px solid var(${error ? "--destructive" : "--ring"})`,
          background: "var(--surface-elevated)",
          color: "var(--foreground)",
          font: "inherit",
          outline: "none",
          boxShadow: "none",
        }}
      />
      {busy ? (
        <Spinner
          data-tree-inline-spinner
          aria-label="Creating"
          style={{ width: 12, height: 12, flexShrink: 0 }}
        />
      ) : null}
    </form>
  );
}
