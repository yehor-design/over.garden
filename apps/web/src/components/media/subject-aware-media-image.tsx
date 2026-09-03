"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";
import {
  resolveMediaPresentation,
  type MediaFocalPoint,
  type MediaPresentationMode,
} from "@/lib/media/presentation-contract";

interface SubjectAwarePresentationProps {
  presentationMode: MediaPresentationMode;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  className?: string;
}

export type SubjectAwareMediaImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "className" | "style" | "alt" | "src" | "srcSet"
> &
  SubjectAwarePresentationProps & {
    src: string;
    alt: string;
    /** `<img srcset>` candidates; see `buildPublicMediaSourceSet`. */
    srcSet?: string | null;
    /** A 16 px WebP data URI painted behind the image until it has loaded. */
    placeholderDataUri?: string | null;
    /** Stretches over the positioned parent, like `next/image`'s `fill`. */
    fill?: boolean;
    /** Above-the-fold: eager and high fetch priority (`next/image` parity). */
    priority?: boolean;
    /** Accepted for `next/image` parity; the served bytes are already final. */
    unoptimized?: boolean;
    style?: CSSProperties;
  };

function resolvePresentation(input: SubjectAwarePresentationProps) {
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
 *
 * Since OVE-371 this is a plain `<img>`: the bytes on media.over.garden are
 * final WebP renditions the browser already sized (2560/1280/480), so the
 * page hands the browser a `srcset` and a placeholder instead of an
 * optimizer hop. `next/image`'s `fill`, `priority`, `sizes`, `width`, and
 * `height` keep their meaning so call sites read the same.
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
  src,
  srcSet,
  placeholderDataUri,
  fill = false,
  priority = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- accepted for next/image parity, intentionally unused
  unoptimized,
  loading,
  decoding,
  fetchPriority,
  onLoad,
  ...imageProps
}: SubjectAwareMediaImageProps) {
  const presentation = resolvePresentation({
    presentationMode,
    focalX,
    focalY,
    intrinsicWidth,
    intrinsicHeight,
  });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // A cached image can finish before hydration attaches `onLoad`.
    if (imageRef.current?.complete) setLoaded(true);
  }, [src]);
  const placeholderStyle: CSSProperties | undefined =
    placeholderDataUri && !loaded
      ? {
          backgroundImage: `url("${placeholderDataUri}")`,
          backgroundSize: presentation.mode === "cover" ? "cover" : "contain",
          backgroundPosition: presentation.objectPosition,
          backgroundRepeat: "no-repeat",
        }
      : undefined;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- final WebP renditions with an explicit srcset (OVE-371)
    <img
      {...imageProps}
      ref={imageRef}
      src={src}
      srcSet={srcSet ?? undefined}
      alt={alt}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? "async"}
      fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        presentation.objectFitClass,
        fill && "absolute inset-0 h-full w-full",
        className,
      )}
      style={{
        ...placeholderStyle,
        ...style,
        objectPosition: presentation.objectPosition,
      }}
      data-media-presentation={presentation.mode}
      data-media-object-position={presentation.objectPosition}
      data-media-serve-class={presentation.serveClass}
      data-media-placeholder={placeholderDataUri ? "true" : undefined}
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
      data-media-serve-class={presentation.serveClass}
    />
  );
}
