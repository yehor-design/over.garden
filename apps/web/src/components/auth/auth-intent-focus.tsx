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

    let frame = 0;
    let remainingAttempts = 8;
    const focusWhenReady = () => {
      if (focusAuthIntentControl(selector)) return;
      remainingAttempts -= 1;
      if (remainingAttempts > 0) {
        frame = window.requestAnimationFrame(focusWhenReady);
      }
    };
    frame = window.requestAnimationFrame(focusWhenReady);

    return () => window.cancelAnimationFrame(frame);
  }, [action, control]);

  return null;
}

export function focusAuthIntentControl(
  selector: string,
  root: Pick<Document, "querySelector"> = document,
) {
  const target = root.querySelector(selector) as HTMLElement | null;
  if (!target) return false;

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
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
