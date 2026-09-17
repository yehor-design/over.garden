import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-6 text-caption",
  md: "size-8 text-body-sm",
  lg: "size-12 text-body",
  xl: "size-16 text-h3",
} as const;

/**
 * A gardener's picture, or their initial.
 *
 * The image is decorative — `alt=""` — because the name is beside it in every
 * place the product uses one. Where it is genuinely alone, the caller passes
 * `label`, which becomes the group's accessible name. Reserving the box with a
 * fixed size means a late-loading picture shifts nothing (DESIGN.md §2.10).
 */
function Avatar({
  className,
  src,
  name,
  size = "md",
  label,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  src?: string | null;
  /** Used for the fallback initial, and never rendered as the image's alt. */
  name: string;
  size?: keyof typeof sizes;
  label?: string;
}) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? "?";
  return (
    <span
      data-slot="avatar"
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-sunken font-medium text-text-secondary",
        sizes[size],
        className,
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden={label ? "true" : undefined}>{initial}</span>
      )}
    </span>
  );
}

/**
 * Several of them, overlapped. The group carries one accessible name and the
 * avatars inside it are decoration, so a reader hears "three gardeners" rather
 * than three initials.
 */
function AvatarGroup({
  className,
  label,
  overflow,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  label: string;
  /** "+4", when the list is longer than what is shown. */
  overflow?: number;
}) {
  return (
    <span
      data-slot="avatar-group"
      role="img"
      aria-label={label}
      className={cn("inline-flex items-center -space-x-2", className)}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex items-center -space-x-2">
        {children}
        {overflow && overflow > 0 ? (
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-sunken text-caption font-medium text-text-secondary tabular-nums">
            +{overflow}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export { Avatar, AvatarGroup };
