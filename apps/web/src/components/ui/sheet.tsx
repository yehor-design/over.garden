"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

/**
 * What a `Dialog` becomes below `lg`, and what filters open into at any width
 * (DESIGN.md §5.5).
 *
 * The focus rules are a dialog's, because it is one: focus trapped, `Esc`
 * closes, focus returns to the trigger, background inert — all from `base-ui`.
 * A sheet hides the results behind it, which is why a filter sheet gets Apply
 * and Clear while the desktop filter bar does not.
 *
 * **A sheet never opens another overlay.**
 */

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-overlay bg-surface-inverse/30 transition-opacity duration-base ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

type SheetContentProps = SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
} & (
    | { showCloseButton?: true; closeLabel: string }
    | { showCloseButton: false; closeLabel?: never }
  );

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  closeLabel,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      {/* Entry motion is 16 px, not 40: nothing moves more than that on entry
          (DESIGN.md §2.7), and only opacity and transform are animated. */}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-overlay flex flex-col gap-4 bg-surface bg-clip-padding text-body-sm text-text shadow-overlay transition duration-base ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-4 data-[side=bottom]:data-starting-style:translate-y-4 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:-translate-x-4 data-[side=left]:data-starting-style:-translate-x-4 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-4 data-[side=right]:data-starting-style:translate-x-4 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:-translate-y-4 data-[side=top]:data-starting-style:-translate-y-4 data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && closeLabel ? (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <IconButton
                variant="ghost"
                className="absolute top-3 right-3"
                size="sm"
                label={closeLabel}
              />
            }
          >
            <XIcon />
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-h4 text-text-heading", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body-sm text-text-muted", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
