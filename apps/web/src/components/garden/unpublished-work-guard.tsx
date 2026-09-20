"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * One warning before unpublished work is lost (`OVE-458` AC5, ADR-0022 D3).
 *
 * Nothing in the composer is durable until an acknowledged Publish: there is no
 * draft, no IndexedDB and no offline queue, by decision. `beforeunload` already
 * covered reload, close and an address typed into the bar — and covered none of
 * the ways a reader actually leaves, because a click on "Мій сад" in the shell
 * is a client-side navigation and fires no unload event at all. The composer
 * simply unmounted and the work was gone.
 *
 * So the guard watches clicks instead, in the capture phase, before the router
 * sees them. It stops only what would really lose the work — a left click,
 * unmodified, on a same-origin link that leads somewhere else — and hands the
 * reader the choice in the design system's own `AlertDialog` rather than the
 * browser's. Confirming re-issues the navigation through the router, so the
 * destination is the one they pressed.
 *
 * It warns **once**: the dialog is the whole interruption, and leaving after it
 * asks nothing further.
 */
/**
 * Four strings, so the create composers and the edit composer can each speak
 * their own language about the same loss: one publishes, the other saves.
 */
export interface UnpublishedWorkGuardCopy {
  leaveTitle: string;
  leaveDescription: string;
  leaveConfirm: string;
  leaveCancel: string;
}

export function shouldGuardNavigation(
  anchor: HTMLAnchorElement,
  here: { pathname: string; search: string },
): boolean {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  // A link the gardener wrote is part of the document, not a way out of it: a
  // press inside a `contenteditable` puts the caret in the anchor and
  // navigates nowhere.
  if (anchor.closest("[contenteditable='true']")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  let destination: URL;
  try {
    destination = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }
  if (destination.origin !== window.location.origin) return false;
  // The same page with a different hash is not leaving it.
  return (
    destination.pathname !== here.pathname || destination.search !== here.search
  );
}

export function UnpublishedWorkGuard({
  active,
  copy,
}: {
  /** Dirty, and not yet published. */
  active: boolean;
  copy: UnpublishedWorkGuardCopy;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  /**
   * Set once the reader has decided to go. The listener is attached only while
   * `active`, but `active` is still true during the router's own navigation —
   * the composer is mounted until the new route commits — so without this the
   * next press would ask a question the reader has already answered.
   */
  const leavingRef = useRef(false);

  const onDocumentClick = useCallback((event: MouseEvent) => {
    if (leavingRef.current) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (
      !shouldGuardNavigation(anchor, {
        pathname: window.location.pathname,
        search: window.location.search,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPending(anchor.href);
  }, []);

  useEffect(() => {
    if (!active) return;
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [active, onDocumentClick]);

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
    >
      <AlertDialogContent data-unpublished-work-guard="true">
        <AlertDialogTitle>{copy.leaveTitle}</AlertDialogTitle>
        <AlertDialogDescription>
          {copy.leaveDescription}
        </AlertDialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPending(null)}
          >
            {copy.leaveCancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            data-unpublished-work-guard-confirm="true"
            onClick={() => {
              const href = pending;
              setPending(null);
              leavingRef.current = true;
              if (href) router.push(href);
            }}
          >
            {copy.leaveConfirm}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
