import { ImageOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { ImageLightbox, type LightboxImage } from "@/components/markdown/ImageLightbox";
import { hasElectronRuntime } from "@/platform/desktop";
import { providerMediaSourceUrl, providerMediaTarget } from "@/platform/desktop/providerMedia";

function resolveImageSource(source: string | undefined) {
  if (!source || !hasElectronRuntime() || !providerMediaTarget(source)) return source;
  return providerMediaSourceUrl(source);
}

/** Every image of the document the clicked one belongs to, in reading order. */
function documentImages(trigger: HTMLElement) {
  const root = trigger.closest("[data-markdown-root]") ?? trigger.parentElement;
  const elements = Array.from(
    root?.querySelectorAll<HTMLImageElement>("img[data-markdown-image]") ?? [],
  );
  const images: LightboxImage[] = elements.map((image) => ({
    src: image.currentSrc || image.src,
    alt: image.alt,
  }));
  const index = elements.findIndex((image) => trigger.contains(image));
  return { images, index: Math.max(0, index) };
}

export function MarkdownImage({ src, alt, ...props }: ComponentProps<"img">) {
  const [gallery, setGallery] = useState<{ images: LightboxImage[]; index: number } | null>(null);
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
        onClick={(event) => setGallery(documentImages(event.currentTarget))}
      >
        <img
          {...props}
          data-markdown-image
          src={source}
          alt={alt}
          loading="lazy"
          className="border-border/60 max-h-[480px] max-w-full rounded-lg border object-contain"
          onError={() => setFailed(true)}
        />
      </button>
      <ImageLightbox
        images={gallery?.images ?? []}
        index={gallery?.index ?? null}
        onIndexChange={(index) => setGallery((current) => (current ? { ...current, index } : null))}
        onClose={() => setGallery(null)}
      />
    </>
  );
}
