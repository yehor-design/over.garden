"use client";

const ATTRIBUTE = "data-og-status-announcer";

/**
 * Says an outcome to a screen reader after the control that caused it is gone
 * (`OVE-488`): a deleted entry takes its own menu and dialog with it, and a
 * live region inside either would unmount before it spoke. One polite region
 * on `<body>` outlives both, and a client navigation too.
 *
 * It is never the only copy of anything: the page itself shows the outcome
 * (the entry is no longer there), and this only says so aloud.
 */
export function announceStatus(message: string): void {
  if (typeof document === "undefined" || !message) return;
  let region = document.querySelector<HTMLElement>(`[${ATTRIBUTE}]`);
  if (!region) {
    region = document.createElement("div");
    region.setAttribute(ATTRIBUTE, "true");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.className = "sr-only";
    document.body.append(region);
  }
  // Emptied first, so the same words said twice are said twice.
  region.textContent = "";
  const target = region;
  window.setTimeout(() => {
    target.textContent = message;
  }, 50);
}
