"use client";

import { useCallback, useId, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  normalizeFocalPoint,
  objectPositionCss,
  resolveMediaFocalPoint,
  type MediaFocalPoint,
} from "@/lib/media/presentation-contract";

export interface FocalPointControlCopy {
  label: string;
  hint: string;
  coverPreview: string;
  containPreview: string;
}

export interface FocalPointControlProps {
  imageUrl: string;
  focal: MediaFocalPoint;
  disabled?: boolean;
  copy: FocalPointControlCopy;
  className?: string;
  onChange: (next: MediaFocalPoint) => void;
}

/**
 * Accessible focal-point control: click/tap or arrow keys move the subject
 * marker. Previews representative cover and contain frames.
 */
export function FocalPointControl({
  imageUrl,
  focal,
  disabled = false,
  copy,
  className,
  onChange,
}: FocalPointControlProps) {
  const labelId = useId();
  const focalResolution = resolveMediaFocalPoint(focal);
  const safe = focalResolution.focal;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const valueText = `x ${Math.round(safe.x * 100)}% · y ${Math.round(safe.y * 100)}%`;

  const setFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = surfaceRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      onChange(normalizeFocalPoint({ x, y }));
    },
    [disabled, onChange],
  );

  return (
    <div
      className={cn("grid gap-2", className)}
      data-focal-point-control="true"
      data-media-serve-class={focalResolution.serveClass}
    >
      <div className="grid gap-0.5">
        <p id={labelId} className="text-caption font-medium text-text">
          {copy.label}
        </p>
        <p className="text-caption text-text-muted">{copy.hint}</p>
        {/* The value, visibly (`OVE-458` AC7). `aria-valuetext` says it to a
            screen reader and to nobody else, so a keyboard user moving the
            marker two per cent at a time had no way to see where it had got
            to — and neither did anyone checking that it had moved at all. */}
        <p
          data-focal-point-value="true"
          className="text-caption text-text-muted tabular-nums"
        >
          {valueText}
        </p>
      </div>

      <div
        ref={surfaceRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safe.x * 100)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-md border border-border bg-surface-sunken outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-disabled:opacity-60"
        onClick={(event) => setFromClientPoint(event.clientX, event.clientY)}
        onKeyDown={(event) => {
          if (disabled) return;
          const step = event.shiftKey ? 0.1 : 0.02;
          let next = { ...safe };
          if (event.key === "ArrowLeft") next = { ...next, x: next.x - step };
          else if (event.key === "ArrowRight")
            next = { ...next, x: next.x + step };
          else if (event.key === "ArrowUp")
            next = { ...next, y: next.y - step };
          else if (event.key === "ArrowDown")
            next = { ...next, y: next.y + step };
          else return;
          event.preventDefault();
          onChange(
            normalizeFocalPoint({
              x: Math.min(1, Math.max(0, next.x)),
              y: Math.min(1, Math.max(0, next.y)),
            }),
          );
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: objectPositionCss(safe) }}
          draggable={false}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-action shadow-popover"
          style={{ left: `${safe.x * 100}%`, top: `${safe.y * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <figure className="grid gap-1">
          <figcaption className="text-caption text-text-muted">
            {copy.coverPreview}
          </figcaption>
          <div className="relative aspect-video overflow-hidden rounded border border-border bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: objectPositionCss(safe) }}
            />
          </div>
        </figure>
        <figure className="grid gap-1">
          <figcaption className="text-caption text-text-muted">
            {copy.containPreview}
          </figcaption>
          <div className="relative aspect-video overflow-hidden rounded border border-border bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        </figure>
      </div>
    </div>
  );
}
