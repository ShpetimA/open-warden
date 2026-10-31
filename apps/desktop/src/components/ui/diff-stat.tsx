import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const diffStatVariants = cva(
  "inline-flex items-baseline gap-1 font-mono text-xs font-semibold tabular-nums",
  {
    variants: {
      kind: {
        addition: "text-diff-addition",
        deletion: "text-diff-deletion",
        modification: "text-diff-modification",
        conflict: "text-diff-conflict",
        neutral: "text-muted-foreground",
      },
    },
    defaultVariants: {
      kind: "neutral",
    },
  },
);

const diffStatMetadata = {
  addition: { label: "additions", prefix: "+" },
  deletion: { label: "deletions", prefix: "−" },
  modification: { label: "modifications", prefix: "~" },
  conflict: { label: "conflicts", prefix: "!" },
  neutral: { label: "files", prefix: "" },
} as const;

type DiffStatKind = keyof typeof diffStatMetadata;

type DiffStatProps = Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof diffStatVariants> & {
    value: number;
    label?: string;
    showLabel?: boolean;
  };

function DiffStat({
  className,
  kind = "neutral",
  value,
  label,
  showLabel = false,
  ...props
}: DiffStatProps) {
  const resolvedKind: DiffStatKind = kind ?? "neutral";
  const metadata = diffStatMetadata[resolvedKind];
  const accessibleLabel = label ?? metadata.label;

  return (
    <span
      data-slot="diff-stat"
      data-kind={resolvedKind}
      className={cn(diffStatVariants({ kind: resolvedKind }), className)}
      aria-label={`${value} ${accessibleLabel}`}
      {...props}
    >
      <span aria-hidden="true">
        {metadata.prefix}
        {value}
      </span>
      {showLabel ? <span className="font-sans font-normal">{accessibleLabel}</span> : null}
    </span>
  );
}

export { DiffStat };
export type { DiffStatKind };
