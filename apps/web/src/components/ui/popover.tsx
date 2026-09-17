"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

/**
 * A small panel anchored to the control that opened it: a date picker, a set of
 * options, a definition.
 *
 * It is elevation level 1 (`--shadow-popover`, DESIGN.md §2.5) — it floats, so
 * it casts a shadow, unlike a card. `Esc` closes it and focus returns to the
 * trigger.
 *
 * A popover is not a menu. A list of actions on one object is `Menu`, which has
 * the roles and the typeahead a menu needs.
 */
function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popover outline-hidden"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "min-w-48 origin-(--transform-origin) rounded-lg border border-border bg-surface p-3 text-body-sm text-text shadow-popover outline-none",
            "transition-[transform,scale,opacity] duration-base ease-out",
            "data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-h4 text-text-heading", className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger };
