"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * A submit button that asks first — and still submits when nothing is running.
 *
 * DESIGN.md §4.4: a destructive action is `danger`, never `primary`, and it
 * lives behind an `AlertDialog` that names the object being destroyed. ADR-0024
 * D3: a control may not depend on hydration to do its job. Those two rules pull
 * in opposite directions, because a dialog is hydration by definition, and this
 * is the shape that satisfies both:
 *
 * - It renders a real `<button type="submit">` inside the form. Before the
 *   bundle runs, pressing it posts the form — the reader gets the thing they
 *   asked for, in one press instead of two.
 * - Once hydrated, the press is intercepted and the dialog opens. Hydration
 *   *adds* the confirmation; it never takes away the action.
 * - The dialog's own confirm is `form={formId}`, which is how a control in a
 *   portal submits a form it is no longer inside.
 *
 * `formId` is therefore required, and the caller puts the same id on its form.
 */
export function ConfirmSubmit({
  formId,
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type" | "form" | "children"> & {
  formId: string;
  label: React.ReactNode;
  /** Names the object: "Delete the entry 'Tomato — Sep 1'?" */
  title: React.ReactNode;
  /** The consequence, in one sentence. */
  description: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: string;
  variant?: "danger" | "primary" | "secondary";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="submit"
        form={formId}
        variant={variant}
        disabled={disabled}
        data-confirm-submit={formId}
        onClick={(event) => {
          if (disabled) return;
          event.preventDefault();
          setOpen(true);
        }}
        {...props}
      >
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-confirm-submit-dialog={formId}>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} variant={variant}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
