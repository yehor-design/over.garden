"use client";

import { useHydrated } from "./shell-session";

/**
 * Renders its children only once the document has hydrated.
 *
 * For what a static document must not render while it is prerendered: a client
 * component that calls a router hook (ADR-0032 D3). The analytics tags are the
 * case — they decide from the address whether they run, they draw nothing, and
 * nothing about them is wanted before the bundle is there to run them.
 */
export function AfterHydration({ children }: { children: React.ReactNode }) {
  return useHydrated() ? children : null;
}
