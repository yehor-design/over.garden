import {
  OVER_GARDEN_LOGO_PATHS,
  OVER_GARDEN_LOGO_VIEWBOX,
} from "./over-garden-logo-paths";

/**
 * The OverGarden logo: the two-line `OVER / GARDEN` wordmark with the
 * snail-and-flower mark, exactly as the final artwork draws it.
 *
 * The lockup is inline rather than an `<img>` for two reasons: it inherits
 * `currentColor`, so it follows the brand chip's foreground in both themes
 * without a second asset, and it needs no request of its own in the header
 * that every page renders above the fold. The paths live in
 * `over-garden-logo-paths.ts`, which the raw lifecycle document reads too.
 */
export function OverGardenLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={OVER_GARDEN_LOGO_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {OVER_GARDEN_LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
