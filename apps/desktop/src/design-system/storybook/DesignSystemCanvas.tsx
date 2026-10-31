import type { ReactNode } from "react";

type DesignSystemCanvasProps = Readonly<{
  title: string;
  description?: string;
  children: ReactNode;
}>;

export function DesignSystemCanvas({ title, description, children }: DesignSystemCanvasProps) {
  return (
    <main className="bg-background text-foreground min-h-screen w-full min-w-[min(64rem,calc(100vw-2rem))] p-8 antialiased">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-2 text-sm leading-6 text-pretty">{description}</p>
        ) : null}
      </header>
      {children}
    </main>
  );
}
