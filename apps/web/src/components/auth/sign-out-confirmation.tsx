"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { TrustClientCopy } from "@/lib/trust-client-copy";

/**
 * The confirmation before a session ends. Its own module so the dialog's code
 * — `base-ui`'s alert dialog, its focus trap and scroll lock — arrives when a
 * reader asks to sign out, not with every page a guest opens (`OVE-468`).
 */
export function SignOutConfirmation({
  open,
  copy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  copy: TrustClientCopy["signOut"];
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent data-sign-out-confirmation="true">
        <AlertDialogTitle>{copy.confirmationTitle}</AlertDialogTitle>
        <AlertDialogDescription>
          {copy.confirmationDescription}
        </AlertDialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {copy.confirmationCancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            data-sign-out-confirm-action="true"
            onClick={onConfirm}
          >
            {copy.confirmationAction}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
