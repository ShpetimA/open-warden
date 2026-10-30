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

function imageDimension(value: string | number | undefined) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined;
}

export function MarkdownImage(props: ComponentProps<"img">) {
  const source = resolveImageSource(typeof props.src === "string" ? props.src : undefined);
  return (
    <MarkdownImagePreview
      key={source}
      {...props}
      src={source}
      originalSource={typeof props.src === "string" ? props.src : undefined}
    />
  );
}

function MarkdownImagePreview({
  src,
  originalSource,
  alt,
  width,
  height,
  onLoad,
  onError,
  ...props
}: ComponentProps<"img"> & { originalSource?: string }) {
  const [gallery, setGallery] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const knownWidth = imageDimension(width);
  const knownHeight = imageDimension(height);
  const dimensionsKnown = knownWidth !== undefined && knownHeight !== undefined;

  return (
    <>
      <span
        data-slot="markdown-image-frame"
        aria-busy={state === "loading"}
        className="border-border/60 bg-surface-1 relative my-2 inline-block w-full max-w-full overflow-hidden rounded-lg border align-middle"
        style={{
          width: dimensionsKnown ? `min(100%, ${knownWidth}px)` : undefined,
          aspectRatio: dimensionsKnown ? `${knownWidth} / ${knownHeight}` : "16 / 9",
          maxHeight: 480,
        }}
      >
        {state === "failed" ? (
          <a
            href={originalSource}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ImageOff className="size-5 shrink-0" />
            <span className="max-w-full truncate">{alt || "Image could not be loaded"}</span>
            <span>Open original image</span>
          </a>
        ) : (
          <button
            type="button"
            aria-label={`Open image: ${alt || "Attached image"}`}
            className="absolute inset-0 cursor-zoom-in focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setGallery(documentImages(event.currentTarget));
            }}
          >
            {state === "loading" ? (
              <span
                aria-hidden="true"
                className="bg-muted absolute inset-0 motion-safe:animate-pulse"
              />
            ) : null}
            <img
              {...props}
              width={width}
              height={height}
              data-markdown-image
              src={src}
              alt={alt}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) => {
                setState("ready");
                onLoad?.(event);
              }}
              onError={(event) => {
                setState("failed");
                onError?.(event);
              }}
            />
          </button>
        )}
      </span>
      <ImageLightbox
        images={gallery?.images ?? []}
        index={gallery?.index ?? null}
        onIndexChange={(index) => setGallery((current) => (current ? { ...current, index } : null))}
        onClose={() => setGallery(null)}
      />
    </>
  );
}
