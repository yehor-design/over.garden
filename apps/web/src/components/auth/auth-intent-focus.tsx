"use client";

import { useEffect } from "react";

import type { AuthIntentAction } from "@/lib/auth/auth-intent-contract";

export function AuthIntentFocus({
  action,
  control = null,
}: {
  action: AuthIntentAction | null;
  control?: string | null;
}) {
  useEffect(() => {
    const selector = authIntentFocusSelector(action, control);
    if (!selector) return;

    // A control inside a streamed region can arrive well after the page does
    // — a community's membership button waits for the viewer's membership —
    // and a static shell can draw a stand-in for it first (the guest's join
    // button) that the streamed one then replaces, taking focus with it. The
    // old eight animation frames either gave up before the control came or
    // focused the stand-in, and the reader returned from signing in to a page
    // with nothing focused (`OVE-504`). So the control is watched for, and
    // re-focused when replaced, until a bound — and never taken back from
    // wherever the reader has put focus themselves.
    let focused: Element | null = null;
    let stopped = false;
    const check = () => {
      if (stopped) return;
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== focused &&
        !active.matches(selector)
      ) {
        stop();
        return;
      }
      if (focused && focused.isConnected && active === focused) return;
      if (focusAuthIntentControl(selector)) focused = document.activeElement;
    };
    const observer = new MutationObserver(check);
    // Arriving is one change and becoming focusable is another (an owner's
    // form can hold its button disabled until the owner scope settles), so a
    // short poll runs beside the observer.
    const poll = window.setInterval(check, 150);
    const deadline = window.setTimeout(
      () => stop(),
      AUTH_INTENT_FOCUS_DEADLINE_MS,
    );
    // The first press or key is the reader's, and so is focus after it.
    const yield_ = () => stop();
    function stop() {
      stopped = true;
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(deadline);
      document.removeEventListener("pointerdown", yield_, true);
      document.removeEventListener("keydown", yield_, true);
    }
    document.addEventListener("pointerdown", yield_, true);
    document.addEventListener("keydown", yield_, true);
    observer.observe(document.body, { childList: true, subtree: true });
    check();

    return stop;
  }, [action, control]);

  return null;
}

/** How long a returned reader's control is waited for before giving up. */
export const AUTH_INTENT_FOCUS_DEADLINE_MS = 10_000;

/**
 * Focuses the first match that can take focus, never a guest's stand-in. A
 * streamed page can hold a hidden copy of a region beside the shown one, and
 * `focus()` on the hidden copy does nothing; so each match is tried until the
 * document says one has focus.
 */
export function focusAuthIntentControl(
  selector: string,
  root: Pick<Document, "querySelectorAll"> = document,
) {
  for (const target of root.querySelectorAll<HTMLElement>(selector)) {
    // A resumed action's page is only reached signed in, so a guest's
    // control here is a stand-in the member's will replace: pressing it would
    // start signing in again.
    if (target.hasAttribute?.("data-auth-intent-guest")) continue;
    target.focus({ preventScroll: true });
    const owner = target.ownerDocument as Document | undefined;
    if (owner && owner.activeElement !== target) continue;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }
  return false;
}

export function authIntentFocusSelector(
  action: AuthIntentAction | null,
  control: string | null = null,
) {
  if (!action) return null;
  const actionSelector = `[data-auth-intent-control="${action}"]`;
  return control
    ? `${actionSelector}[data-auth-intent-control-ref="${control}"]`
    : actionSelector;
}
