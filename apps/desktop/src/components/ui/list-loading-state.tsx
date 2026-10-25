import { Spinner } from "@/components/ui/spinner";

export function ListLoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4 p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Spinner aria-hidden="true" className="shrink-0 motion-reduce:animate-none" />
        <span>{label}</span>
      </div>
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="bg-border h-3 w-3/4 rounded" />
        <div className="bg-border ml-4 h-3 w-3/5 rounded" />
        <div className="bg-border ml-4 h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}
