import { AlertCircle, AlertTriangle, Info, Lightbulb } from "lucide-react";

import type { LspDiagnostic } from "@/features/source-control/types";

type Props = {
  diagnostic: LspDiagnostic;
};

function severityClasses(severity: LspDiagnostic["severity"]) {
  switch (severity) {
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-foreground";
    case "information":
      return "border-sky-500/30 bg-sky-500/10 text-foreground";
    case "hint":
      return "border-emerald-500/30 bg-emerald-500/10 text-foreground";
    case "error":
    default:
      return "border-red-500/30 bg-red-500/10 text-foreground";
  }
}

function severityIconClasses(severity: LspDiagnostic["severity"]) {
  switch (severity) {
    case "warning":
      return "text-amber-600 dark:text-amber-300";
    case "information":
      return "text-sky-600 dark:text-sky-300";
    case "hint":
      return "text-emerald-600 dark:text-emerald-300";
    case "error":
    default:
      return "text-red-600 dark:text-red-300";
  }
}

function SeverityIcon({ severity }: { severity: LspDiagnostic["severity"] }) {
  const className = `h-3 w-3 shrink-0 ${severityIconClasses(severity)}`;

  switch (severity) {
    case "warning":
      return <AlertTriangle className={className} />;
    case "information":
      return <Info className={className} />;
    case "hint":
      return <Lightbulb className={className} />;
    case "error":
    default:
      return <AlertCircle className={className} />;
  }
}

function metadataLabel(diagnostic: LspDiagnostic) {
  return [diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
}

export function DiagnosticAnnotation({ diagnostic }: Props) {
  const metadata = metadataLabel(diagnostic);

  return (
    <div
      className={`flex max-w-[32rem] items-start gap-1.5 border px-2 py-1 text-[10px] ${severityClasses(diagnostic.severity)}`}
    >
      <SeverityIcon severity={diagnostic.severity} />
      <div className="min-w-0 flex-1">
        <div className="truncate leading-4">{diagnostic.message}</div>
        {metadata ? <div className="opacity-80">{metadata}</div> : null}
      </div>
    </div>
  );
}
