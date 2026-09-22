"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";

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
 *
 * `OVE-488` closes the two ways out it did not see. **Back**: while the work is
 * dirty the guard keeps one copy of the current history entry on top, so the
 * browser's Back lands on the same page and asks instead of unmounting the
 * composer; Stay puts the copy back, Leave goes back for real. **Close and
 * Escape**: the composer's own Close asks through `closeRequestRef`, the same
 * dialog, so a clean composer closes at once and a dirty one asks first.
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

/** Marks the copy of the current entry the guard keeps on top of history. */
const HISTORY_MARKER = "__overgardenUnpublishedWork";

type PendingLeave =
  | { kind: "href"; href: string }
  | { kind: "close"; leave: () => void }
  | { kind: "back" };

/**
 * Escape asks to close the composer unless something inside it took the key
 * first — the slash menu, a listbox, the link field, an open date picker —
 * or an input method is still composing.
 */
export function isComposerEscape(
  event: Pick<
    ReactKeyboardEvent<HTMLElement>,
    "key" | "defaultPrevented" | "target" | "currentTarget"
  > & { nativeEvent?: { isComposing?: boolean } },
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  if (event.nativeEvent?.isComposing) return false;
  const target = event.target;
  // React carries a key pressed in a portal — a menu, a popover, this guard's
  // own dialog — up to the composer; those close themselves.
  if (!(target instanceof Node) || !event.currentTarget.contains(target)) {
    return false;
  }
  if (
    target instanceof Element &&
    target.closest(
      '[role="combobox"], [role="listbox"], [aria-expanded="true"], input[type="date"]',
    )
  ) {
    return false;
  }
  return true;
}

export function UnpublishedWorkGuard({
  active,
  copy,
  closeRequestRef,
}: {
  /** Dirty, and not yet published. */
  active: boolean;
  copy: UnpublishedWorkGuardCopy;
  /**
   * Filled with the guarded close: call it with what closing does, and it
   * runs at once when nothing would be lost, or after the reader chooses to
   * leave.
   */
  closeRequestRef?: MutableRefObject<((leave: () => void) => void) | null>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
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
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
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
    setPending({ kind: "href", href: anchor.href });
  }, []);

  useEffect(() => {
    if (!active) return;
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [active, onDocumentClick]);

  useEffect(() => {
    if (!closeRequestRef) return;
    const request = (leave: () => void) => {
      if (!activeRef.current || leavingRef.current) {
        leave();
        return;
      }
      setPending({ kind: "close", leave });
    };
    closeRequestRef.current = request;
    return () => {
      if (closeRequestRef.current === request) closeRequestRef.current = null;
    };
  }, [closeRequestRef]);

  // Back. The copy on top means Back arrives here rather than on the page
  // before, and the composer is still mounted to ask.
  useEffect(() => {
    if (!active) return;
    if (!isGuardEntry(window.history.state)) pushGuardEntry();
    const onPopState = () => {
      if (leavingRef.current || isGuardEntry(window.history.state)) return;
      setPending({ kind: "back" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);

  function stay() {
    if (pending?.kind === "back") pushGuardEntry();
    setPending(null);
  }

  function leave() {
    const decided = pending;
    setPending(null);
    leavingRef.current = true;
    if (!decided) return;
    if (decided.kind === "href") router.push(decided.href);
    else if (decided.kind === "close") decided.leave();
    else window.history.back();
  }

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
    >
      <AlertDialogContent data-unpublished-work-guard="true">
        <AlertDialogTitle>{copy.leaveTitle}</AlertDialogTitle>
        <AlertDialogDescription>{copy.leaveDescription}</AlertDialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            data-unpublished-work-guard-stay="true"
            onClick={stay}
          >
            {copy.leaveCancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            data-unpublished-work-guard-confirm="true"
            onClick={leave}
          >
            {copy.leaveConfirm}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isGuardEntry(state: unknown): boolean {
  return Boolean(
    state &&
    typeof state === "object" &&
    (state as Record<string, unknown>)[HISTORY_MARKER],
  );
}

/**
 * One more copy of the entry the reader is on, marked. The router's own state
 * rides along, so the router treats it as its own entry for the same page.
 */
function pushGuardEntry() {
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  window.history.pushState(
    { ...state, [HISTORY_MARKER]: true },
    "",
    window.location.href,
  );
}

/**
 * How far Back goes to leave the page: past the guard's own copy when it is
 * on top, so a composer's Close lands where the reader came from.
 */
export function stepsBackToLeave(): number {
  return isGuardEntry(window.history.state) ? -2 : -1;
}
