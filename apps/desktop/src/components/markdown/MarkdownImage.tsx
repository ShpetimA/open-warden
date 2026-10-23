import { ImageOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { hasElectronRuntime } from "@/platform/desktop";
import { providerMediaSourceUrl, providerMediaTarget } from "@/platform/desktop/providerMedia";

function resolveImageSource(source: string | undefined) {
  if (!source || !hasElectronRuntime() || !providerMediaTarget(source)) return source;
  return providerMediaSourceUrl(source);
}

export function MarkdownImage({ src, alt, ...props }: ComponentProps<"img">) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = resolveImageSource(typeof src === "string" ? src : undefined);

  if (failed) {
    return (
      <a
        href={typeof src === "string" ? src : undefined}
        target="_blank"
        rel="noreferrer"
        className="border-border/70 bg-surface-1 text-muted-foreground hover:text-foreground my-2 inline-flex max-w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs"
      >
        <ImageOff className="size-4 shrink-0" />
        <span className="truncate">{alt || "Image could not be loaded"}</span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className="my-2 inline-block max-w-full cursor-zoom-in rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => setOpen(true)}
      >
        <img
          {...props}
          src={source}
          alt={alt}
          loading="lazy"
          className="border-border/60 max-h-[480px] max-w-full rounded-lg border object-contain"
          onError={() => setFailed(true)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-auto max-w-[92vw] items-center justify-center p-3 sm:max-w-[92vw]">
          <DialogTitle className="sr-only">{alt || "Image"}</DialogTitle>
          <img
            src={source}
            alt={alt}
            className="max-h-[86vh] max-w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
