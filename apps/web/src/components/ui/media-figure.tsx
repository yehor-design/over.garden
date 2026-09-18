import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { cn } from "@/lib/utils";

/**
 * A gardener's photograph, with its caption, in a box it reserved first.
 *
 * The photograph is the product (DESIGN.md §2.10), and the pipeline under it is
 * unchanged and not negotiable: browser-made WebP at 2560 / 1280 / 480, a
 * `<img srcset>` served from `media.over.garden`, a 16 px placeholder painted
 * until it arrives, and **no Vercel image optimizer** (ADR-0022 D2).
 *
 * Three things this component is for, and they are the reasons it exists
 * rather than each page assembling an `<img>`:
 *
 * 1. **The box comes before the picture.** `cover` is 16:9 and `card` is 4:3,
 *    both as `aspect-ratio` from a token, so nothing shifts when the bytes
 *    land. `auto` is the in-prose case, where the ratio is the photograph's
 *    own and the box is reserved by its intrinsic `width`/`height` instead —
 *    reserving a *wrong* ratio there would letterbox a gardener's photograph
 *    to make a number tidy.
 * 2. **A caption is a `<figcaption>` or it is nothing.** A caption rendered as
 *    a sibling paragraph is not associated with the image by anything a screen
 *    reader can follow.
 * 3. **`alt` is required and is never the empty string.** A photograph of the
 *    thing an entry is about carries meaning; `lib/public-media-alt.ts` decides
 *    what the sentence is. A decorative image is `Avatar`'s or
 *    `EmptyState`'s job, and both pass `alt=""` themselves.
 */

export interface MediaFigureProps
  extends Omit<React.ComponentProps<"figure">, "children"> {
  src: string;
  /** `<img srcset>` candidates from `buildPublicMediaSourceSet`. */
  srcSet?: string | null;
  sizes?: string;
  /** The real sentence. Never `""` — see the note above. */
  alt: string;
  caption?: React.ReactNode;
  /** The 16 px WebP data URI painted until the photograph arrives. */
  placeholderDataUri?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  /** `cover` 16:9 · `card` 4:3 · `auto` the photograph's own (in prose). */
  aspect?: "cover" | "card" | "auto";
  /** Above the fold: eager, and high fetch priority. */
  priority?: boolean;
}

function MediaFigure({
  className,
  src,
  srcSet,
  sizes,
  alt,
  caption,
  placeholderDataUri,
  focalX,
  focalY,
  intrinsicWidth,
  intrinsicHeight,
  aspect = "cover",
  priority = false,
  ...props
}: MediaFigureProps) {
  const fixedRatio = aspect !== "auto";

  return (
    <figure
      data-slot="media-figure"
      data-media-aspect={aspect}
      className={cn("grid gap-2", className)}
      {...props}
    >
      <div
        className={cn(
          "overflow-hidden rounded-lg bg-surface-sunken",
          fixedRatio && "relative",
          aspect === "cover" && "aspect-cover",
          aspect === "card" && "aspect-card",
        )}
      >
        <SubjectAwareMediaImage
          src={src}
          srcSet={srcSet ?? undefined}
          alt={alt}
          sizes={sizes ?? "(max-width: 767px) 100vw, 704px"}
          placeholderDataUri={placeholderDataUri}
          focalX={focalX}
          focalY={focalY}
          intrinsicWidth={intrinsicWidth}
          intrinsicHeight={intrinsicHeight}
          /* `cover` crops to the reserved box around the focal point;
             `contain` in prose shows the whole photograph at its own ratio. */
          presentationMode={fixedRatio ? "cover" : "contain"}
          priority={priority}
          fill={fixedRatio}
          {...(fixedRatio
            ? {}
            : {
                width: intrinsicWidth ?? undefined,
                height: intrinsicHeight ?? undefined,
                className: "h-auto w-full",
              })}
          unoptimized
        />
      </div>
      {caption ? (
        <figcaption className="text-caption text-text-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export { MediaFigure };
