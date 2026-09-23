"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  OwnerUserIdField,
  useOptionalOwnerScope,
} from "@/components/auth/owner-scope";
import { TrashIcon } from "@/components/icons/Trash";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { HiddenField } from "@/components/ui/hidden-field";
import { announceStatus } from "@/lib/browser/announce-status";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatSpacePageTemplate as template,
  getSpacePageCopy,
} from "@/lib/space-page-copy";

import type { SpaceDeleteActionState } from "./actions";

/**
 * Deleting an empty space (`OVE-490`). It is offered only when the server has
 * counted nothing in the space, asks once with Cancel focused, and treats only
 * the server's answer as success: if something arrived in the meantime, the
 * delete is refused and the page says so instead of taking it along.
 */
export function SpaceDeleteControl({
  locale,
  spaceId,
  spaceName,
  action,
}: {
  locale: InterfaceLocale;
  spaceId: string;
  spaceName: string;
  action: (
    previousState: SpaceDeleteActionState,
    formData: FormData,
  ) => Promise<SpaceDeleteActionState>;
}) {
  const copy = getSpacePageCopy(locale).settings;
  const router = useRouter();
  const ownerScope = useOptionalOwnerScope();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // The outcome is handled inside the action: a deleted space takes this
  // control out of the tree in the commit that delivers the answer.
  const [state, formAction] = useActionState<SpaceDeleteActionState, FormData>(
    async (previous, formData) => {
      const outcome = await action(previous, formData);
      if (!outcome) return outcome;
      setOpen(false);
      if ("mutationScope" in outcome) {
        ownerScope?.handleActionResult(outcome);
        return outcome;
      }
      if (outcome.status === "deleted") {
        announceStatus(template(copy.deleted, { name: spaceName }));
        router.push("/garden#garden-spaces");
        router.refresh();
      }
      return outcome;
    },
    undefined,
  );
  const refused =
    state && "status" in state && state.status !== "deleted"
      ? copy.deleteFailed
      : null;

  return (
    <div className="grid gap-3">
      <div>
        <Button
          ref={triggerRef}
          type="button"
          variant="secondary"
          className="text-danger-text"
          data-space-delete-trigger={spaceId}
          onClick={() => setOpen(true)}
        >
          <TrashIcon aria-hidden="true" />
          {copy.deleteButton}
        </Button>
      </div>
      {refused ? (
        <p
          role="alert"
          data-space-delete-refused="true"
          className="text-body-sm text-danger-text"
        >
          {refused}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          data-space-delete-dialog={spaceId}
          initialFocus={cancelRef}
          finalFocus={triggerRef}
        >
          <AlertDialogTitle>
            {template(copy.deleteConfirmTitle, { name: spaceName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {copy.deleteConfirmBody}
          </AlertDialogDescription>
          <form
            action={formAction}
            onSubmit={(event) => event.stopPropagation()}
            className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <OwnerUserIdField />
            <HiddenField name="spaceId" value={spaceId} />
            <DeleteChoices
              spaceId={spaceId}
              cancelRef={cancelRef}
              cancelLabel={copy.deleteCancel}
              confirmLabel={copy.deleteConfirm}
              pendingLabel={copy.deleting}
            />
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteChoices({
  spaceId,
  cancelRef,
  cancelLabel,
  confirmLabel,
  pendingLabel,
}: {
  spaceId: string;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <AlertDialogClose
        disabled={pending}
        render={
          <Button ref={cancelRef} type="button" variant="secondary">
            {cancelLabel}
          </Button>
        }
      />
      <Button
        type="submit"
        variant="danger"
        disabled={pending}
        data-space-delete-confirm={spaceId}
      >
        {pending ? pendingLabel : confirmLabel}
      </Button>
    </>
  );
}
