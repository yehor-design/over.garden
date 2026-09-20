"use client";

import { Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list-row";
import { Toast, ToastRegion } from "@/components/ui/toast";

/**
 * The shelf: what bookmarks and the wishlist are both made of (`OVE-456`).
 *
 * They were two lists with two row shapes, two removal affordances and two
 * ideas of what a saved thing looks like — one an `<li>` of flex boxes with a
 * toggle borrowed from the public page, the other an `<li>` of flex boxes with
 * a bare submit button. A reader has one mental model of "things I saved", so
 * there is one row and one way to take a thing off it.
 */
export function ShelfRow({
  kindLabel,
  title,
  href,
  meta,
  actions,
}: {
  /** What kind of thing this is, above the name. */
  kindLabel: ReactNode;
  title: ReactNode;
  href?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ListRow
      data-shelf-row="true"
      title={title}
      href={href}
      description={
        <span className="text-overline text-text-muted uppercase">
          {kindLabel}
        </span>
      }
      meta={meta}
      actions={actions}
      className="flex-row-reverse items-center justify-end gap-3 sm:flex-row sm:justify-between"
    />
  );
}

/**
 * The removal affordance. One icon button, one accessible name that says what
 * is being removed — "Remove" alone leaves a screen-reader user pressing the
 * third of five buttons with the same name.
 */
export function ShelfRemoveButton({ label }: { label: string }) {
  return (
    <IconButton
      type="submit"
      variant="ghost"
      data-shelf-remove="true"
      label={label}
    >
      <Trash2 />
    </IconButton>
  );
}

/**
 * What the shelf says after a removal, with the way back.
 *
 * The toast is in the served HTML — it is rendered by the document the
 * redirect landed on, not by a client effect — so a reader without JavaScript
 * still sees the outcome and can still press Undo, which is a real form with a
 * real endpoint. Hydration adds the dismiss control and the five-second timer
 * and nothing else (DESIGN.md §5.5).
 */
export function ShelfNotice({
  regionLabel,
  title,
  dismissLabel,
  undo,
}: {
  regionLabel: string;
  title: string;
  dismissLabel: string;
  undo?: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <ToastRegion label={regionLabel}>
      <Toast
        data-shelf-notice="true"
        title={title}
        undo={undo}
        dismissLabel={dismissLabel}
        onDismiss={() => setDismissed(true)}
      />
    </ToastRegion>
  );
}
