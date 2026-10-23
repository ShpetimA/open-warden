import { useHotkey } from "@tanstack/react-hotkeys";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type LightboxImage = { src: string; alt: string };

/** Full-size image viewer that steps through the other images of the same document. */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && images.length > 0;
  const current = open ? images[index] : null;
  const multiple = images.length > 1;

  function step(direction: 1 | -1) {
    if (index === null || !multiple) return;
    onIndexChange((index + direction + images.length) % images.length);
  }

  useHotkey("ArrowLeft", () => step(-1), { enabled: open && multiple });
  useHotkey("ArrowRight", () => step(1), { enabled: open && multiple });

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[92vh] w-auto max-w-[84vw] items-center justify-center overflow-visible p-3 sm:max-w-[84vw]">
        <DialogTitle className="sr-only">{current?.alt || "Image"}</DialogTitle>
        <DialogDescription className="sr-only">
          {multiple ? `Image ${String((index ?? 0) + 1)} of ${String(images.length)}` : "Image"}
        </DialogDescription>
        {current ? (
          <img
            key={current.src}
            src={current.src}
            alt={current.alt}
            className="max-h-[86vh] max-w-full rounded-md object-contain"
          />
        ) : null}
        {multiple ? (
          <>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Previous image"
              title="Previous image (←)"
              className="bg-background/95 absolute top-1/2 -left-14 -translate-y-1/2 rounded-full shadow-lg"
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Next image"
              title="Next image (→)"
              className="bg-background/95 absolute top-1/2 -right-14 -translate-y-1/2 rounded-full shadow-lg"
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
            <div className="bg-background/95 text-muted-foreground absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full border px-2.5 py-0.5 text-xs tabular-nums shadow">
              {(index ?? 0) + 1} / {images.length}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
