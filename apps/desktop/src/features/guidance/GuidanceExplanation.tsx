import { ReviewNote } from "@/components/ui/review-note";

export function GuidanceExplanation({
  title,
  body,
  referenceLabel,
  details,
}: {
  title: string;
  body: string;
  referenceLabel?: string;
  details?: string;
}) {
  return (
    <div className="min-w-0 py-2 pr-2">
      <ReviewNote
        title={title}
        body={body}
        label="Step explanation"
        details={details ? { label: "Step details", body: details } : undefined}
        metadata={
          referenceLabel ? <span className="tabular-nums">{referenceLabel}</span> : undefined
        }
      />
    </div>
  );
}
