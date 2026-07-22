"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

function MenuContent({
  className,
  align = "end",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50 outline-hidden"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "min-w-40 origin-(--transform-origin) rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-hidden transition-[transform,scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const menuItemClassName =
  "relative flex min-h-10 w-full cursor-default select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(menuItemClassName, className)}
      {...props}
    />
  );
}

function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="menu-link-item"
      className={cn(menuItemClassName, className)}
      {...props}
    />
  );
}

function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />;
}

function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(menuItemClassName, "pr-8", className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <Check aria-hidden="true" className="size-4" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function MenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      className={cn(menuItemClassName, className)}
      {...props}
    >
      {children}
      <ChevronRight aria-hidden="true" className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubTrigger,
  MenuTrigger,
};
