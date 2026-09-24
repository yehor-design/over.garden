import type { Icon, IconProps } from "@phosphor-icons/react";

/** Icons supplement a control's text or accessible name; never name themselves. */
export type InterfaceIconProps = Omit<
  IconProps,
  "size" | "weight" | "alt" | "strokeWidth"
> & {
  size?: 16 | 20 | 24;
  /** Fill is reserved for a selected social action or navigation destination. */
  selected?: boolean;
};

/** `--size-icon-sm|md|lg` (DESIGN.md §2.8), named on the glyph for the CSS. */
const ICON_SIZE_TOKEN = { 16: "sm", 20: "md", 24: "lg" } as const;

/**
 * One Phosphor glyph at a token size.
 *
 * The size is written twice, on purpose. The SVG's own `width`/`height` carry
 * the pixel value, which every engine parses; `data-og-icon-size` names the
 * token, and `globals.css` sizes it with `var(--size-icon-*)` so a glyph still
 * grows with the reader's text size. The attributes used to be
 * `width="var(--size-icon-md)"` alone. A `var()` in an SVG presentation
 * attribute is not parsed by every Chromium — 141 rejects it — and there an
 * icon with no sizing class of its own drew at the width of its container:
 * 288 px in a 320 px specimen, a 431 px page at 390 (`OVE-478`).
 */
export function interfaceIcon(Glyph: Icon) {
  return function InterfaceIcon({
    size = 20,
    selected = false,
    ...props
  }: InterfaceIconProps) {
    return (
      <Glyph
        {...props}
        size={size}
        weight={selected ? "fill" : "regular"}
        aria-hidden="true"
        focusable="false"
        data-og-icon="phosphor"
        data-og-icon-size={ICON_SIZE_TOKEN[size]}
      />
    );
  };
}
