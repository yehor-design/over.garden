"use client";

import Image from "next/image";
import type { CSSProperties, ComponentProps, ImgHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import {
  resolveMediaPresentation,
  type MediaFocalPoint,
  type MediaPresentationMode,
} from "@/lib/media/presentation-contract";

type NextImageProps = ComponentProps<typeof Image>;

export type SubjectAwareMediaImageProps = Omit<
  NextImageProps,
  "className" | "style" | "objectFit" | "objectPosition"
> & {
  presentationMode: MediaPresentationMode;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  className?: string;
  style?: CSSProperties;
};

function resolvePresentation(input: {
  presentationMode: MediaPresentationMode;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
}) {
  return resolveMediaPresentation({
    mode: input.presentationMode,
    focal: {
      x: typeof input.focalX === "number" ? input.focalX : Number.NaN,
      y: typeof input.focalY === "number" ? input.focalY : Number.NaN,
    } satisfies MediaFocalPoint,
    intrinsic: {
      width: input.intrinsicWidth ?? null,
      height: input.intrinsicHeight ?? null,
    },
  });
}

/**
 * Shared subject-aware media presentation (OVE-197).
 * Cover surfaces pass presentationMode="cover"; gallery/full readback use "contain".
 * Inline object-position is intentional: focal is continuous [0,1], not a token.
 */
export function SubjectAwareMediaImage({
  presentationMode,
  focalX,
  focalY,
  intrinsicWidth,
  intrinsicHeight,
  className,
  style,
  alt,
  ...imageProps
}: SubjectAwareMediaImageProps) {
  const presentation = resolvePresentation({
    presentationMode,
    focalX,
    focalY,
    intrinsicWidth,
    intrinsicHeight,
  });

  return (
    <Image
      {...imageProps}
      alt={alt}
      className={cn(presentation.objectFitClass, className)}
      style={{
        ...style,
        objectPosition: presentation.objectPosition,
      }}
      data-media-presentation={presentation.mode}
      data-media-object-position={presentation.objectPosition}
    />
  );
}

export type SubjectAwareHtmlImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "className" | "style"
> & {
  presentationMode: MediaPresentationMode;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  className?: string;
};

/** Plain <img> variant for blob/loopback URLs where next/image is unavailable. */
export function SubjectAwareHtmlImage({
  presentationMode,
  focalX,
  focalY,
  intrinsicWidth,
  intrinsicHeight,
  className,
  alt = "",
  ...imageProps
}: SubjectAwareHtmlImageProps) {
  const presentation = resolvePresentation({
    presentationMode,
    focalX,
    focalY,
    intrinsicWidth,
    intrinsicHeight,
  });

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob/loopback fixture URLs
    <img
      {...imageProps}
      alt={alt}
      className={cn(presentation.objectFitClass, className)}
      style={{ objectPosition: presentation.objectPosition }}
      data-media-presentation={presentation.mode}
      data-media-object-position={presentation.objectPosition}
    />
  );
}
