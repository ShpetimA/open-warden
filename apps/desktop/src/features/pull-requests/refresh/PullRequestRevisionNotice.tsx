export function PullRequestRevisionNotice({
  stale,
  hasContent,
}: {
  stale: boolean;
  hasContent: boolean;
}) {
  if (!stale || !hasContent) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-end">
      <p
        role="status"
        className="pointer-events-auto border-warning-border bg-warning-surface max-w-lg rounded-md border px-3 py-2 text-xs shadow-md"
      >
        Showing the previous PR revision while new changes load. Commenting is paused.
      </p>
    </div>
  );
}
