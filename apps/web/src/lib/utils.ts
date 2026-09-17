import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's type scale and semantic colours, told apart.
 *
 * `tailwind-merge` decides which of two conflicting utilities wins by putting
 * them in the same class group, and its default configuration knows only
 * Tailwind's own scales. Ours are named — `text-body-sm` is a size,
 * `text-text-on-fill` is a colour — and both land in `text-color` unless it is
 * told otherwise. The last one then wins, which silently deleted the colour
 * from every filled button in the product: a primary button rendered its label
 * in body ink on a green fill, measured 1.95 by axe against the real
 * stylesheet, and no unit test could see it because both classes are still in
 * the source.
 */
const TEXT_SIZES = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "body-lg",
  "body",
  "body-sm",
  "caption",
  "overline",
  "mono",
] as const;

/** The closed semantic colour set of DESIGN.md §2.2, as `text-*` can spell it. */
const TEXT_COLORS = [
  "text",
  "text-heading",
  "text-secondary",
  "text-muted",
  "text-disabled",
  "text-on-fill",
  "link",
  "link-hover",
  "action",
  "action-hover",
  "action-subtle-text",
  "success-text",
  "danger-text",
  "warning-text",
  "warning-fill",
  "info-text",
  "surface",
  "surface-inverse",
] as const;

const DURATIONS = ["instant", "fast", "base", "slow"] as const;
const SHADOWS = ["popover", "overlay"] as const;
const LAYERS = [
  "base",
  "sticky",
  "rail",
  "header",
  "popover",
  "overlay",
  "toast",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TEXT_SIZES] }],
      "text-color": [{ text: [...TEXT_COLORS] }],
      shadow: [{ shadow: [...SHADOWS] }],
      duration: [{ duration: [...DURATIONS] }],
      z: [{ z: [...LAYERS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
