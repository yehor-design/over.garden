"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

/**
 * A confirmation for something that cannot be taken back.
 *
 * DESIGN.md §7: never "Are you sure?" alone. It names the object and the
 * consequence — "Delete the entry 'Tomato — Sep 1'? The public page answers 410
 * for seven days, then goes." The destructive control is `danger`, never
 * `primary`, and it is the only place `danger` appears.
 */

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-overlay bg-surface-inverse/40 transition-opacity duration-base ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <AlertDialogPrimitive.Viewport className="fixed inset-0 z-overlay grid min-h-dvh place-items-center overflow-y-auto p-4">
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          className={cn(
            "w-full max-w-md rounded-xl border border-border bg-surface p-5 text-text shadow-overlay transition-[transform,scale,opacity] duration-slow ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-h3 text-balance text-text-heading", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("mt-2 text-body-sm text-text-muted", className)}
      {...props}
    />
  );
}

function AlertDialogClose(props: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}

export {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
};
