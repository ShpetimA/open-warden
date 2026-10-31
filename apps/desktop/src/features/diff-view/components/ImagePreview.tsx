import { useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/ui/error-state";
import { gitApi } from "@/features/source-control/api";
import { desktop } from "@/platform/desktop";
import {
  desktopFailure,
  failureFromUnknown,
  type DesktopFailure,
} from "@/platform/desktop/failure";
import {
  imagePreviewDataSchema,
  type ImageFile,
  type ImageSource,
} from "@/platform/desktop/imagePreview";

export type ImagePreviewState =
  | { status: "loading" }
  | { status: "failed"; error: DesktopFailure }
  | { status: "ready"; data: { width: number; height: number; url: string } };

type Props = {
  name: string;
  label: string;
  state: ImagePreviewState;
  onRetry: () => void;
  onDecodeError: () => void;
};

export function ImagePreview(props: Props) {
  return (
    <div
      className="flex min-h-96 min-w-0 flex-col gap-2"
      role="group"
      aria-label={`${props.label} image preview`}
    >
      <ImagePreviewContent {...props} />
    </div>
  );
}

function ImagePreviewContent({ name, label, state, onRetry, onDecodeError }: Props) {
  if (state.status === "failed") {
    return (
      <ActionError
        title="Couldn’t preview this image"
        error={state.error}
        recovery={{ label: "Retry", onAction: onRetry }}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <div
        className="text-muted-foreground bg-surface-toolbar flex h-72 items-center justify-center rounded-md border text-xs"
        role="status"
      >
        Loading image…
      </div>
    );
  }

  return (
    <ReadyImagePreview name={name} label={label} data={state.data} onDecodeError={onDecodeError} />
  );
}

function ReadyImagePreview({
  name,
  label,
  data,
  onDecodeError,
}: {
  name: string;
  label: string;
  data: Extract<ImagePreviewState, { status: "ready" }>["data"];
  onDecodeError: () => void;
}) {
  const [view, setView] = useState<"fit" | "actual">("fit");

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {data.width} × {data.height}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            className="min-h-10"
            variant={view === "fit" ? "secondary" : "ghost"}
            aria-pressed={view === "fit"}
            onClick={() => setView("fit")}
          >
            Fit
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-10"
            variant={view === "actual" ? "secondary" : "ghost"}
            aria-pressed={view === "actual"}
            onClick={() => setView("actual")}
          >
            Actual size
          </Button>
        </div>
      </div>
      <div
        className={`bg-background h-80 min-w-0 overflow-auto rounded-md border ${view === "fit" ? "flex items-center justify-center" : ""}`}
        style={{
          backgroundImage:
            "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      >
        <img
          src={data.url}
          alt={`${label}: ${name}`}
          width={data.width}
          height={data.height}
          draggable={false}
          onError={onDecodeError}
          style={
            view === "fit"
              ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }
              : { maxWidth: "none", width: data.width, height: data.height }
          }
        />
      </div>
    </>
  );
}

export function RepositoryImagePreview({ image, label }: { image: ImageFile; label: string }) {
  if (image.preview.state === "unavailable") {
    const reasons = {
      "byte-limit": "Image preview is limited to 8 MiB per image.",
      "pixel-limit": "Image preview is limited to 16 megapixels and 16,384 pixels per dimension.",
      "invalid-image": "This image has an unreadable or damaged header.",
    };

    return <p className="text-muted-foreground text-xs">{reasons[image.preview.reason]}</p>;
  }

  return (
    <LoadedImagePreview
      key={JSON.stringify(image.preview.source)}
      name={image.name}
      label={label}
      source={image.preview.source}
    />
  );
}

function LoadedImagePreview({
  name,
  label,
  source,
}: {
  name: string;
  label: string;
  source: ImageSource;
}) {
  const dispatch = useAppDispatch();
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImagePreviewState>({ status: "loading" });

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? false),
    );
    if (frame.current) observer.observe(frame.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let current = true;
    let objectUrl: string | undefined;
    setState({ status: "loading" });
    if (!visible) return;

    // IPC reads cannot be cancelled; the owner discards replies after selection or visibility changes.
    void desktop.getImagePreview(source).then(
      (result) => {
        if (!current) return;
        if (!result.ok) {
          setState({ status: "failed", error: result.error });
          return;
        }

        const parsed = imagePreviewDataSchema.safeParse(result.value);
        if (!parsed.success) {
          setState({
            status: "failed",
            error: desktopFailure(
              "getImagePreview",
              "unavailable",
              "The desktop service returned unreadable image data.",
            ),
          });
          return;
        }

        const image = parsed.data;
        objectUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(image.bytes)], { type: image.mimeType }),
        );
        setState({
          status: "ready",
          data: { width: image.width, height: image.height, url: objectUrl },
        });
      },
      (cause: unknown) => {
        if (current)
          setState({ status: "failed", error: failureFromUnknown(cause, "getImagePreview") });
      },
    );

    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, attempt, visible]);

  function retry() {
    if (source.kind === "worktree") {
      dispatch(gitApi.util.invalidateTags([{ type: "WorkingVersions", id: source.repoPath }]));
    }

    setAttempt((value) => value + 1);
  }

  return (
    <div ref={frame}>
      <ImagePreview
        name={name}
        label={label}
        state={state}
        onRetry={retry}
        onDecodeError={() => {
          if (state.status === "ready") URL.revokeObjectURL(state.data.url);
          setState({
            status: "failed",
            error: desktopFailure(
              "getImagePreview",
              "invalid-input",
              "The image could not be decoded. It may be damaged or unsupported.",
            ),
          });
        }}
      />
    </div>
  );
}
