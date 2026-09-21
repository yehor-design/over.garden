import { cn } from "@/lib/utils";
import {
  ILLUSTRATION_SIZES,
  type Illustration,
  type IllustrationSize,
} from "@/lib/illustrations";

/**
 * Nothing here — and the two ways that happens are not the same state
 * (DESIGN.md §5.4).
 *
 * `empty-first-run`: one 3D object, centred, above a short bold sentence, one
 * muted line and one action. The shape Remote, Digg, Gamma and Xero all landed
 * on.
 *
 * `empty-no-results`: **no illustration.** Something does exist and the filters
 * excluded it, so what the reader needs is the filters they set and a way to
 * clear them — not a picture.
 *
 * The illustration arrives as a resolved prop, never as a path: `EmptyState`
 * does not know where the file lives, which is what keeps a change of source a
 * one-directory change (`src/lib/illustrations.ts`, ADR-0031 D10).
 */
function EmptyState({
  className,
  variant = "first-run",
  illustration,
  illustrationSize = "page",
  title,
  description,
  action,
  filters,
  headingId,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: "first-run" | "no-results";
  illustration?: Illustration | null;
  illustrationSize?: IllustrationSize;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** The active filters, as chips. `no-results` only. */
  filters?: React.ReactNode;
  headingId?: string;
}) {
  const size = ILLUSTRATION_SIZES[illustrationSize];
  const showIllustration = variant === "first-run" && illustration;
  return (
    <div
      data-slot="empty-state"
      data-screen-state={
        variant === "first-run" ? "empty-first-run" : "empty-no-results"
      }
      className={cn(
        "grid min-w-0 grid-cols-1 justify-items-center gap-3 px-4 py-10 text-center",
        className,
      )}
      {...props}
    >
      {showIllustration ? (
        // The heading beside it carries the meaning, so the picture is
        // decorative and its box is reserved (DESIGN.md §2.9, §2.10).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={illustration.src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className={cn(illustrationSize === "card" ? "size-24" : "size-36")}
        />
      ) : null}
      <h3
        id={headingId}
        className="max-w-full min-w-0 text-h3 text-balance break-words text-text-heading"
      >
        {title}
      </h3>
      {description ? (
        <p className="max-w-full min-w-0 text-body-sm break-words text-text-muted">
          {description}
        </p>
      ) : null}
      {variant === "no-results" && filters ? (
        <div className="flex flex-wrap justify-center gap-2">{filters}</div>
      ) : null}
      {action ? <div className="mt-1 max-w-full min-w-0">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
