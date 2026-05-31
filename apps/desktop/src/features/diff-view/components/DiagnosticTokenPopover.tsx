import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { LspDiagnostic } from "@/features/source-control/types";
import type { DiagnosticPopoverAnchorRect } from "@/features/diff-view/util/lsp_token";

type Props = {
  open: boolean;
  anchorRect: DiagnosticPopoverAnchorRect | null;
  diagnostics: LspDiagnostic[];
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

function diagnosticSeverityBadgeClasses(severity: LspDiagnostic["severity"]) {
  switch (severity) {
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "information":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "hint":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "error":
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

export function DiagnosticTokenPopover({
  open,
  anchorRect,
  diagnostics,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  if (!anchorRect || diagnostics.length === 0) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: Math.max(anchorRect.width, 1),
            height: Math.max(anchorRect.height, 1),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        className="w-[360px] max-h-[320px] rounded-none overflow-hidden p-0"
        style={{ maxWidth: "calc(100vw - 16px)" }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-full overflow-auto">
          <div className="flex flex-col gap-2">
            {diagnostics.map((diagnostic) => {
              const metadata = [diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
              return (
                <div
                  key={`${diagnostic.message}:${diagnostic.severity}:${diagnostic.startLine}:${diagnostic.startCharacter}:${diagnostic.endLine}:${diagnostic.endCharacter}:${diagnostic.source ?? ""}:${diagnostic.code ?? ""}`}
                  className="bg-muted/40 border p-2"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${diagnosticSeverityBadgeClasses(diagnostic.severity)}`}
                    >
                      {diagnostic.severity}
                    </span>
                    {metadata ? (
                      <span className="text-muted-foreground text-[10px]">{metadata}</span>
                    ) : null}
                  </div>
                  <div className="text-xs leading-relaxed">{diagnostic.message}</div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
