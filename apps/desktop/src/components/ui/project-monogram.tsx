import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function projectInitials(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const first = words[0] ?? "?";
  if (/^[A-Z]{2,3}$/.test(first)) return first.slice(0, 2);
  return (
    words.length > 1 ? `${first[0]}${words.at(-1)?.[0] ?? ""}` : first.slice(0, 2)
  ).toUpperCase();
}

export function ProjectMonogram({
  name,
  identity,
  className,
}: {
  name: string;
  identity: string;
  className?: string;
}) {
  let hash = 0;
  for (const char of identity) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const style: CSSProperties & { "--project-hue": number } = {
    "--project-hue": Math.abs(hash) % 360,
  };
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        "project-monogram inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] text-[9px] font-semibold leading-none tracking-tight",
        className,
      )}
    >
      {projectInitials(name)}
    </span>
  );
}
