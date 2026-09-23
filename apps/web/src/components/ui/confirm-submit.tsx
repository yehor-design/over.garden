"use client";

import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { useFormStatus } from "react-dom";

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
 *
 * One confirmation is one submission (`OVE-500`, criterion 9): while the form
 * is on its way the trigger is `aria-disabled` and says `pendingLabel`, and a
 * second press of Confirm in the same opening does nothing.
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
  pendingLabel,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type" | "form" | "children"> & {
  formId: string;
  label: React.ReactNode;
  /** What the trigger says while the form is on its way. */
  pendingLabel?: React.ReactNode;
  /** Names the object: "Delete the entry 'Tomato — Sep 1'?" */
  title: React.ReactNode;
  /** The consequence, in one sentence. */
  description: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: string;
  variant?: "danger" | "primary" | "secondary";
  disabled?: boolean;
}) {
  // No state here, and no read of the form's status. React re-renders a
  // status reader during its own submission when state above or beside it
  // changes, and then reads the status as idle (react-dom 19.2): holding the
  // dialog's state in this component made the trigger forget it was pending
  // the moment the dialog closed, so a second press asked again and a second
  // Confirm posted again. The trigger reads the status and holds nothing;
  // the dialog holds its own state and reads nothing.
  const dialog = useRef<ConfirmDialogHandle | null>(null);
  const ask = useCallback(() => dialog.current?.open(), []);

  return (
    <>
      {/* One level that reads nothing sits between this component and the
          trigger. Without it, the dialog's own updates as it closes make
          React re-check the trigger against the form status of that render,
          which it reads as idle, and a second press asked again. Proven by
          `confirm-submit.test.tsx` (the pending test). */}
      <TriggerSlot>
        <ConfirmTrigger
          formId={formId}
          variant={variant}
          disabled={disabled}
          label={label}
          pendingLabel={pendingLabel}
          onAsk={ask}
          {...props}
        />
      </TriggerSlot>
      <ConfirmDialog
        handle={dialog}
        formId={formId}
        variant={variant}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
      />
    </>
  );
}

function TriggerSlot({ children }: { children: React.ReactNode }) {
  return children;
}

/** The form's own submit button: it asks, and while the form is on its way it refuses. */
function ConfirmTrigger({
  formId,
  variant,
  disabled,
  label,
  pendingLabel,
  onAsk,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type" | "form" | "children"> & {
  formId: string;
  variant: "danger" | "primary" | "secondary";
  disabled: boolean;
  label: React.ReactNode;
  pendingLabel?: React.ReactNode;
  onAsk: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      form={formId}
      variant={variant}
      disabled={disabled}
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      data-confirm-submit={formId}
      onClick={(event) => {
        if (disabled) return;
        event.preventDefault();
        if (pending) return;
        onAsk();
      }}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : label}
    </Button>
  );
}

interface ConfirmDialogHandle {
  open(): void;
}

/**
 * The question. One opening is one answer: a second press of Confirm in the
 * same opening does nothing, and the dialog closes once the submission has
 * started — never before, because a control taken out of the document before
 * its default action runs submits nothing.
 */
function ConfirmDialog({
  handle,
  formId,
  variant,
  title,
  description,
  confirmLabel,
  cancelLabel,
}: {
  handle: Ref<ConfirmDialogHandle>;
  formId: string;
  variant: "danger" | "primary" | "secondary";
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const confirmed = useRef(false);
  useImperativeHandle(
    handle,
    () => ({
      open() {
        confirmed.current = false;
        setOpen(true);
      },
    }),
    [],
  );

  return (
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
          <Button
            type="submit"
            form={formId}
            variant={variant}
            data-confirm-submit-confirm={formId}
            onClick={(event) => {
              if (confirmed.current) {
                event.preventDefault();
                return;
              }
              confirmed.current = true;
              // Close once the submission has started, never before it.
              window.setTimeout(() => setOpen(false), 0);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
