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

export function interfaceIcon(Glyph: Icon) {
  return function InterfaceIcon({
    size = 20,
    selected = false,
    ...props
  }: InterfaceIconProps) {
    const dimensions = {
      16: "var(--size-icon-sm)",
      20: "var(--size-icon-md)",
      24: "var(--size-icon-lg)",
    } as const;
    return (
      <Glyph
        {...props}
        size={dimensions[size]}
        weight={selected ? "fill" : "regular"}
        aria-hidden="true"
        focusable="false"
        data-og-icon="phosphor"
      />
    );
  };
}
