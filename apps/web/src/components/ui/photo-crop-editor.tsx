"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ArrowClockwiseIcon } from "@/components/icons/ArrowClockwise";
import { ArrowCounterClockwiseIcon } from "@/components/icons/ArrowCounterClockwise";
import { Button } from "@/components/ui/button";
import type { PhotoCropEditorCopy } from "@/lib/owned-photo-copy";

export type { PhotoCropEditorCopy };

/**
 * The photo step's editor (DESIGN.md §5.25): the frame is fixed — the cover's
 * aspect — and the photo moves, turns and grows under it. It runs entirely in
 * the browser, before the WebP encode: the result is a new image drawn from
 * the frame, so nothing the frame leaves out, and no EXIF or location, ever
 * reaches a server (ADR-0022 D2).
 *
 * Every control has a keyboard equivalent and a name. The frame itself takes
 * the arrow keys (move), `+` and `−` (zoom) and `R` (turn); «Повернути»,
 * «Скинути» and «Готово» are ordinary buttons, and the zoom is a range input.
 */
export interface PhotoCropEditorProps {
  file: Blob;
  /** Width over height of the frame; the cover's is 16 / 9. */
  aspect: number;
  copy: PhotoCropEditorCopy;
  /** The longest output edge, in pixels. */
  maxOutputEdge?: number;
  onDone: (image: Blob) => void;
  onCancel: () => void;
}

interface Crop {
  /** Quarter turns clockwise, 0–3. */
  turns: number;
  zoom: number;
  /** The photo's centre relative to the frame's, in frame pixels. */
  x: number;
  y: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const STEP = 12;
const INITIAL: Crop = { turns: 0, zoom: 1, x: 0, y: 0 };

/** The rotated photo's size, and the scale at which it just covers the frame. */
export function coverGeometry(
  natural: { width: number; height: number },
  frame: { width: number; height: number },
  crop: Pick<Crop, "turns" | "zoom">,
) {
  const sideways = crop.turns % 2 === 1;
  const width = sideways ? natural.height : natural.width;
  const height = sideways ? natural.width : natural.height;
  const cover = Math.max(frame.width / width, frame.height / height);
  const scale = cover * crop.zoom;
  return {
    scale,
    /** How far the centre may move before an edge shows through. */
    maxX: Math.max(0, (width * scale - frame.width) / 2),
    maxY: Math.max(0, (height * scale - frame.height) / 2),
  };
}

export function clampCrop(
  crop: Crop,
  natural: { width: number; height: number },
  frame: { width: number; height: number },
): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  const { maxX, maxY } = coverGeometry(natural, frame, {
    turns: crop.turns,
    zoom,
  });
  return {
    turns: ((crop.turns % 4) + 4) % 4,
    zoom,
    x: Math.min(maxX, Math.max(-maxX, crop.x)),
    y: Math.min(maxY, Math.max(-maxY, crop.y)),
  };
}

/**
 * Draw what the frame shows onto a canvas of the output size: the frame's
 * width in the photo's own pixels, capped at `maxEdge`.
 */
export async function renderCrop(input: {
  image: HTMLImageElement;
  natural: { width: number; height: number };
  frame: { width: number; height: number };
  crop: Crop;
  maxEdge: number;
}): Promise<Blob> {
  const { scale } = coverGeometry(input.natural, input.frame, input.crop);
  const sourceWidth = input.frame.width / scale;
  const longEdge = Math.min(
    input.maxEdge,
    Math.round(
      Math.max(
        sourceWidth,
        (sourceWidth * input.frame.height) / input.frame.width,
      ),
    ),
  );
  const aspect = input.frame.width / input.frame.height;
  const width = aspect >= 1 ? longEdge : Math.round(longEdge * aspect);
  const height = aspect >= 1 ? Math.round(longEdge / aspect) : longEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("crop_canvas_unavailable");
  const perFramePixel = canvas.width / input.frame.width;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.translate(input.crop.x * perFramePixel, input.crop.y * perFramePixel);
  context.rotate((input.crop.turns * Math.PI) / 2);
  context.scale(scale * perFramePixel, scale * perFramePixel);
  context.drawImage(
    input.image,
    -input.natural.width / 2,
    -input.natural.height / 2,
    input.natural.width,
    input.natural.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("crop_encode_failed")),
      "image/png",
    );
  });
}

function PhotoCropEditor({
  file,
  aspect,
  copy,
  maxOutputEdge = 2560,
  onDone,
  onCancel,
}: PhotoCropEditorProps) {
  const hintId = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    start: Crop;
  } | null>(null);
  const [natural, setNatural] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [rawCrop, setCrop] = useState<Crop>(INITIAL);
  // Always inside the frame, whatever the frame's size has become.
  const crop =
    natural && frame.width > 0 ? clampCrop(rawCrop, natural, frame) : rawCrop;
  const [status, setStatus] = useState<
    "loading" | "ready" | "unreadable" | "rendering"
  >("loading");

  const url = useMemo(() => URL.createObjectURL(file), [file]);
  // The URL is let go a tick after the editor lets go of it, and not at all
  // when the same URL is taken up again at once: React's development build
  // unmounts and remounts every new component, and a URL revoked in between
  // is a broken image (`ERR_FILE_NOT_FOUND`) whose «Готово» never enables.
  const pendingRevoke = useRef<{ url: string; timer: number } | null>(null);
  useEffect(() => {
    if (pendingRevoke.current?.url === url) {
      window.clearTimeout(pendingRevoke.current.timer);
      pendingRevoke.current = null;
    }
    return () => {
      pendingRevoke.current = {
        url,
        timer: window.setTimeout(() => URL.revokeObjectURL(url), 0),
      };
    };
  }, [url]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      setFrame({ width, height: width / aspect });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [aspect]);

  const update = useCallback(
    (next: (current: Crop) => Crop) => {
      setCrop((current) => {
        if (!natural || frame.width === 0) return current;
        return clampCrop(
          next(clampCrop(current, natural, frame)),
          natural,
          frame,
        );
      });
    },
    [frame, natural],
  );

  const geometry =
    natural && frame.width > 0 ? coverGeometry(natural, frame, crop) : null;

  async function finish() {
    const image = imageRef.current;
    if (!image || !natural || frame.width === 0) return;
    setStatus("rendering");
    try {
      onDone(
        await renderCrop({
          image,
          natural,
          frame,
          crop,
          maxEdge: maxOutputEdge,
        }),
      );
    } catch {
      setStatus("unreadable");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? STEP * 4 : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      update((current) => ({
        ...current,
        x: current.x + move[0],
        y: current.y + move[1],
      }));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      update((current) => ({ ...current, zoom: current.zoom + 0.1 }));
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      update((current) => ({ ...current, zoom: current.zoom - 0.1 }));
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      update((current) => ({
        ...current,
        turns: current.turns + 1,
        x: 0,
        y: 0,
      }));
    }
  }

  return (
    <div
      data-slot="photo-crop-editor"
      className="grid gap-4"
      onKeyDown={(event) => {
        // Escape is the editor's «Скасувати», not the page's close.
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
    >
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label={copy.frameLabel}
        aria-describedby={hintId}
        data-photo-crop-frame="true"
        data-crop-turns={crop.turns}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-lg bg-surface-sunken outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:cursor-grabbing"
        style={{ aspectRatio: String(aspect) }}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            start: crop,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          update(() => ({
            ...current.start,
            x: current.start.x + event.clientX - current.x,
            y: current.start.y + event.clientY - current.y,
          }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(event) => {
          if (!event.ctrlKey && Math.abs(event.deltaY) < 1) return;
          update((current) => ({
            ...current,
            zoom: current.zoom - event.deltaY / 500,
          }));
        }}
      >
        {
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, drawn and transformed in place
          <img
            ref={imageRef}
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
            onLoad={(event) => {
              const image = event.currentTarget;
              setNatural({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
              setStatus("ready");
            }}
            onError={() => setStatus("unreadable")}
            style={
              geometry && natural
                ? {
                    width: `${natural.width * geometry.scale}px`,
                    height: `${natural.height * geometry.scale}px`,
                    transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) rotate(${crop.turns * 90}deg)`,
                  }
                : { opacity: 0 }
            }
          />
        }
        {/* Thirds, as every camera draws them: where to put the subject. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 [&>span]:border-text-on-fill/40"
        >
          {Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className={[
                index % 3 !== 2 ? "border-r" : "",
                index < 6 ? "border-b" : "",
              ].join(" ")}
            />
          ))}
        </div>
        {status === "loading" || status === "rendering" ? (
          <p className="absolute inset-0 grid place-items-center text-body-sm text-text-muted">
            {copy.preparing}
          </p>
        ) : null}
      </div>
      <p id={hintId} className="text-caption text-text-muted">
        {status === "unreadable" ? copy.unreadable : copy.frameHint}
      </p>
      <label className="grid gap-1 text-body-sm text-text">
        <span>{copy.zoom}</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          disabled={status !== "ready"}
          data-photo-crop-zoom="true"
          onChange={(event) => {
            const zoom = Number(event.currentTarget.value);
            update((current) => ({ ...current, zoom }));
          }}
          className="w-full accent-action"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={status !== "ready"}
          data-photo-crop-rotate="true"
          onClick={() =>
            update((current) => ({
              ...current,
              turns: current.turns + 1,
              x: 0,
              y: 0,
            }))
          }
        >
          <ArrowClockwiseIcon aria-hidden="true" />
          {copy.rotate}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={status !== "ready"}
          data-photo-crop-reset="true"
          onClick={() => setCrop(INITIAL)}
        >
          <ArrowCounterClockwiseIcon aria-hidden="true" />
          {copy.reset}
        </Button>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={status !== "ready"}
            data-photo-crop-done="true"
            onClick={() => void finish()}
          >
            {copy.done}
          </Button>
        </span>
      </div>
    </div>
  );
}

export { PhotoCropEditor };
export default PhotoCropEditor;
