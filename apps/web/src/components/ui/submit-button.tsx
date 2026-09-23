"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * A form's submit button that refuses a second press while the first is on
 * its way (`OVE-500`, criterion 9).
 *
 * It stays a real `<button type="submit">`: before the bundle runs it posts
 * like any other, and hydration only adds the refusal. While the form is
 * pending it is `aria-disabled` rather than `disabled` — a disabled button
 * drops keyboard focus to the document, and the reader who pressed Enter
 * would lose their place — and a press is swallowed instead of posting the
 * same change twice. `pendingLabel` says that something is happening; the
 * outcome itself is the server's to report.
 */
export function SubmitButton({
  pendingLabel,
  children,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & {
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
