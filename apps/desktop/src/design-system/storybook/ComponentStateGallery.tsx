import type { ReactNode } from "react";

export type ComponentState = Readonly<{
  label: string;
  content: ReactNode;
}>;

type ComponentStateGalleryProps = Readonly<{
  states: readonly ComponentState[];
}>;

export function ComponentStateGallery({ states }: ComponentStateGalleryProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
      {states.map((state) => (
        <section
          className="bg-surface rounded-xl p-4 shadow-xs ring-1 ring-border"
          key={state.label}
        >
          <h2 className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
            {state.label}
          </h2>
          <div className="flex min-h-12 items-center">{state.content}</div>
        </section>
      ))}
    </div>
  );
}
