"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  OwnerUserIdField,
  useOptionalOwnerScope,
} from "@/components/auth/owner-scope";
import { DotsThreeIcon } from "@/components/icons/DotsThree";
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
import { IconButton } from "@/components/ui/icon-button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { announceStatus } from "@/lib/browser/announce-status";
import { getEntryActionsCopy, withEntryTitle } from "@/lib/entry-actions-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

type DeleteOutcome =
  | { status: "deleted" | "already_deleted" | "acknowledgement_required" }
  | { mutationScope: string };

export interface EntryActionsMenuProps {
  locale: InterfaceLocale;
  entryId: string;
  entryTitle: string;
  /** The object the entry belongs to, so its page is refreshed too. */
  objectId?: string | null;
  editHref?: string | null;
  publicHref?: string | null;
  /** The server action that deletes the entry (ADR-0021). */
  deleteAction: (
    previousState: unknown,
    formData: FormData,
  ) => Promise<unknown>;
  /**
   * Where the owner goes once the entry is gone. Omitted on a list that
   * simply loses the entry: focus then moves to `focusAfterDelete`.
   */
  afterDeleteHref?: string | null;
  /** A selector for what takes focus when the entry leaves a list. */
  focusAfterDelete?: string;
}

/**
 * An entry's own menu (`OVE-488`, OG-UX-045). Edit and the public page are
 * ordinary items; deleting — rare and irreversible — is the last item, apart
 * from both, and never beside Save or Publish. It asks once, naming the entry
 * and what deletion actually does, with Cancel focused first; Cancel and
 * Escape return focus to the menu's button and change nothing. Success is the
 * server's acknowledgement only.
 */
export function EntryActionsMenu({
  locale,
  entryId,
  entryTitle,
  objectId = null,
  editHref = null,
  publicHref = null,
  deleteAction,
  afterDeleteHref = null,
  focusAfterDelete,
}: EntryActionsMenuProps) {
  const copy = getEntryActionsCopy(locale);
  const router = useRouter();
  const ownerScope = useOptionalOwnerScope();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // The outcome is handled inside the action, not in an effect: a deleted
  // entry takes this menu out of the tree in the same commit that delivers
  // the answer, and an effect would never run. The dialog is reachable only
  // once the page is hydrated, so the wrapper costs no pre-hydration endpoint.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, formAction] = useActionState<DeleteOutcome | undefined, FormData>(
    async (previous, formData) => {
      const outcome = (await deleteAction(previous, formData)) as
        | DeleteOutcome
        | undefined;
      if (!outcome) return outcome;
      if ("mutationScope" in outcome) {
        setConfirmOpen(false);
        ownerScope?.handleActionResult(outcome);
        return outcome;
      }
      if (
        outcome.status !== "deleted" &&
        outcome.status !== "already_deleted"
      ) {
        return outcome;
      }
      setConfirmOpen(false);
      announceStatus(withEntryTitle(copy.deleted, entryTitle));
      if (afterDeleteHref) {
        router.push(afterDeleteHref);
        router.refresh();
      } else if (focusAfterDelete) {
        // The menu's own button left with the entry; the list's heading is
        // where a keyboard reader goes on from.
        window.requestAnimationFrame(() => {
          const target = document.querySelector<HTMLElement>(focusAfterDelete);
          if (!target) return;
          if (!target.hasAttribute("tabindex")) {
            target.setAttribute("tabindex", "-1");
          }
          target.focus();
        });
      }
      return outcome;
    },
    undefined,
  );

  return (
    <>
      <Menu modal={false}>
        <MenuTrigger
          render={
            <IconButton
              ref={triggerRef}
              size="sm"
              variant="ghost"
              label={withEntryTitle(copy.menu, entryTitle)}
              title={withEntryTitle(copy.menu, entryTitle)}
              data-entry-actions-trigger={entryId}
            >
              <DotsThreeIcon aria-hidden="true" />
            </IconButton>
          }
        />
        <MenuContent align="end" data-entry-actions-menu={entryId}>
          {editHref ? (
            <MenuLinkItem href={editHref} data-entry-action="edit">
              {copy.edit}
            </MenuLinkItem>
          ) : null}
          {publicHref ? (
            <MenuLinkItem href={publicHref} data-entry-action="open-public">
              {copy.openPublic}
            </MenuLinkItem>
          ) : null}
          {editHref || publicHref ? <MenuSeparator /> : null}
          <MenuItem
            data-entry-action="delete"
            className="text-danger-text data-highlighted:bg-danger-surface data-highlighted:text-danger-text"
            onClick={() => setConfirmOpen(true)}
          >
            <TrashIcon aria-hidden="true" className="size-4" />
            {copy.delete}
          </MenuItem>
        </MenuContent>
      </Menu>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => setConfirmOpen(open)}
      >
        <AlertDialogContent
          data-entry-delete-dialog={entryId}
          initialFocus={cancelRef}
          finalFocus={triggerRef}
        >
          <AlertDialogTitle>
            {withEntryTitle(copy.deleteTitle, entryTitle)}
          </AlertDialogTitle>
          <AlertDialogDescription>{copy.deleteBody}</AlertDialogDescription>
          {/* The dialog is a portal, and React carries a portal's submit up
              its own tree: without this the composer around the menu took
              the confirmation for its own Save (`OVE-488`). */}
          <form
            action={formAction}
            onSubmit={(event) => event.stopPropagation()}
            className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <OwnerUserIdField />
            <HiddenField name="entryId" value={entryId} />
            <HiddenField name="objectId" value={objectId ?? ""} />
            <HiddenField name="deleteAccepted" value="on" />
            <DeleteChoices
              entryId={entryId}
              cancelRef={cancelRef}
              cancelLabel={copy.deleteCancel}
              confirmLabel={copy.deleteConfirm}
              pendingLabel={copy.deleting}
            />
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The two choices, disabled while the server answers. */
function DeleteChoices({
  entryId,
  cancelRef,
  cancelLabel,
  confirmLabel,
  pendingLabel,
}: {
  entryId: string;
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
        data-entry-delete-confirm={entryId}
      >
        {pending ? pendingLabel : confirmLabel}
      </Button>
    </>
  );
}
