"use client";

import { ShellSessionRegion } from "./shell-session";

/**
 * Something only a signed-in gardener sees, on a page that is otherwise the
 * same for everyone (ADR-0032 D2).
 *
 * The page stays static: it does not ask who is reading. This region does, from
 * the session the document already started, and draws its children once the
 * answer is "a gardener". A guest — and the static bytes — get `guest`, which
 * is nothing unless the page has something to say to a guest in that place.
 *
 * It is for *presentation*. What a gardener may do is still decided by the
 * server at the moment they do it (AGENTS.md hard rule 6); a link that appears
 * here grants nothing.
 */
export function SignedInOnly({
  children,
  guest = null,
}: {
  children: React.ReactNode;
  guest?: React.ReactNode;
}) {
  return (
    <ShellSessionRegion
      render={(session) => (session?.isAuthenticated ? children : guest)}
    />
  );
}
