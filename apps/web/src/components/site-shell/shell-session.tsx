"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  Suspense,
  use,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  canonicalSiteShellPath,
  resolveSiteShellSection,
  SITE_SHELL_SECTION_ATTRIBUTE,
} from "@/lib/site-shell-navigation";
import {
  GUEST_SITE_SHELL_SESSION_STATE,
  isPendingSiteShellSession,
  type SiteShellSessionInput,
  type SiteShellSessionState,
} from "@/lib/site-shell-session-state";
import {
  createValueStore,
  useValueStore,
  type ValueStore,
} from "@/lib/value-store";

/**
 * What the chrome learns after the document has been served, held where
 * learning it cannot disturb the page (ADR-0032 D10).
 *
 * Two things arrive late in a static document: **who is reading**, when the
 * session the server started settles, and **where they are**, when hydration
 * can finally ask the router. Both used to be context values, set from an
 * effect. Measured on 2026-09-20: a context that changes above a page makes
 * React mark every boundary it has not hydrated yet — it cannot see whether
 * something inside reads the value — and a boundary whose content has been
 * streamed but not yet *revealed* (React reveals no sooner than 300 ms after
 * the previous reveal) is then rendered on the client instead. The segment the
 * server sent is dropped when its turn comes. `/communities/{slug}` rendered
 * its whole `<main>` twice that way, and a transition made no difference.
 *
 * So neither is a context value. The provider hands down this object, which
 * never changes, and the regions that need one of the two subscribe to it.
 */
interface ShellState {
  pathname: ValueStore<string | null>;
  settledSession: ValueStore<SiteShellSessionState | null>;
}

/**
 * With no shell above — a component rendered alone in a test — the reader is a
 * guest and the address is unknown. Never written to: nothing mounts a bridge.
 */
const DETACHED_SHELL_STATE: ShellState = {
  pathname: createValueStore<string | null>(null),
  settledSession: createValueStore<SiteShellSessionState | null>(
    GUEST_SITE_SHELL_SESSION_STATE,
  ),
};

const ShellStateContext = createContext<ShellState>(DETACHED_SHELL_STATE);
const ShellSessionContext = createContext<SiteShellSessionInput>(
  GUEST_SITE_SHELL_SESSION_STATE,
);

function createShellState(
  session: SiteShellSessionInput,
  pathname: string | null,
): ShellState {
  return {
    pathname: createValueStore(pathname),
    settledSession: createValueStore(
      isPendingSiteShellSession(session) ? null : session,
    ),
  };
}

/**
 * Who is reading and where, for the shell and for whatever a page renders
 * inside it (ADR-0032 D2, D3, D10).
 *
 * **Who.** A static document cannot know. It is prerendered once and served to
 * a guest and to a gardener alike, so the session reaches it as a **promise**
 * the server started and did not await. Nothing in the document waits for it
 * except the few regions that are different for the two readers — and each of
 * those is a `ShellRegion`, a Suspense boundary whose fallback is the guest's
 * rendering. The document's own content is never inside one: a boundary that
 * completes late is revealed by React's inline runtime no sooner than 300 ms
 * after first paint, which is how every public page's LCP came to equal its
 * TTI (`OVE-461`).
 *
 * **Where.** A request-time document reads the address while it renders: it is
 * rendered for one request, and the request says. A static document does not
 * read it on the server at all. It is prerendered at its route's path and
 * served at the browser's, behind a rewrite, so the two disagree
 * (`/uk/journals` against `/journals`). And `usePathname()` cannot simply be
 * put behind a boundary there: Next builds an address's shell by resuming the
 * route's *fallback* shell, the boundary completes during that resume, React
 * outlines it with a segment id allotted at flush — after the postponed state
 * was captured — and the request-time resume then allots the same ids again.
 * Measured on 2026-09-20: `S:7`…`S:b` twice in `/journals`, five segments
 * never revealed, four hydration errors.
 *
 * So in a static document the address is `null` in the served HTML and arrives
 * after hydration, from a reader that only ever mounts on the client. What a
 * reader *sees* does not wait for it: the document's inline script puts the
 * section on `<html>` before first paint and `globals.css` marks the current
 * item from that (`siteShellDocumentBootScript`). What arrives with hydration
 * is what needs React — `aria-current`, the language options' exact targets,
 * the sign-in link's return path.
 */
export function ShellStateProvider({
  session,
  document,
  children,
}: {
  /** A value in a request-time document, a promise in a static one. */
  session: SiteShellSessionInput;
  document: "static" | "request";
  children: React.ReactNode;
}) {
  return document === "request" ? (
    <RequestShellState session={session}>{children}</RequestShellState>
  ) : (
    <StaticShellState session={session}>{children}</StaticShellState>
  );
}

function RequestShellState({
  session,
  children,
}: {
  session: SiteShellSessionInput;
  children: React.ReactNode;
}) {
  const pathname = useShellPathname();
  const [state] = useState(() => createShellState(session, pathname));

  return (
    <ShellSessionContext.Provider value={session}>
      <ShellStateContext.Provider value={state}>
        {children}
        <ShellPathnameBridge />
        <ShellSessionBridge />
        <ShellSectionSync />
      </ShellStateContext.Provider>
    </ShellSessionContext.Provider>
  );
}

function StaticShellState({
  session,
  children,
}: {
  session: SiteShellSessionInput;
  children: React.ReactNode;
}) {
  const [state] = useState(() => createShellState(session, null));

  return (
    <ShellSessionContext.Provider value={session}>
      <ShellStateContext.Provider value={state}>
        {children}
        {/* Beside the page, never above it, and only once hydrated: this is
            the one component that calls `usePathname()`, and a static document
            may not call it while it prerenders. */}
        <AfterShellHydration>
          <ShellPathnameBridge />
        </AfterShellHydration>
        <ShellSessionBridge />
        <ShellSectionSync />
      </ShellStateContext.Provider>
    </ShellSessionContext.Provider>
  );
}

function AfterShellHydration({ children }: { children: React.ReactNode }) {
  return useHydrated() ? children : null;
}

/**
 * Keeps the address true from hydration on, client-side navigations included.
 * A layout effect, so the chrome that reads it is redrawn before the browser
 * paints the navigation it belongs to.
 */
function ShellPathnameBridge() {
  const state = useContext(ShellStateContext);
  const pathname = useShellPathname();

  useLayoutEffect(() => {
    state.pathname.set(pathname);
  }, [pathname, state]);

  return null;
}

/** Publishes the session once the server's promise settles. */
function ShellSessionBridge() {
  const state = useContext(ShellStateContext);
  const session = useContext(ShellSessionContext);

  useEffect(() => {
    if (!isPendingSiteShellSession(session)) {
      state.settledSession.set(session);
      return;
    }
    let current = true;
    const settle = (value: SiteShellSessionState) => {
      if (current) state.settledSession.set(value);
    };
    // A session that cannot be read is a guest's: the chrome must not wait on,
    // or fail with, the one thing it does not need in order to be drawn.
    session.then(settle, () => settle(GUEST_SITE_SHELL_SESSION_STATE));
    return () => {
      current = false;
    };
  }, [session, state]);

  return null;
}

/**
 * The inline script said which section the document was *loaded* in. A
 * client-side navigation changes the address without loading a document, so
 * from hydration on the attribute is kept true here.
 */
function ShellSectionSync() {
  const pathname = useShellPathnameValue();

  useEffect(() => {
    if (pathname === null) return;
    const root = window.document.documentElement;
    const section = resolveSiteShellSection(pathname);
    if (section) root.setAttribute(SITE_SHELL_SECTION_ATTRIBUTE, section);
    else root.removeAttribute(SITE_SHELL_SECTION_ATTRIBUTE);
  }, [pathname]);

  return null;
}

/**
 * The session, suspending while a static document's promise is pending. Call
 * it only under a `ShellRegion` (or a Suspense boundary of your own).
 */
export function useShellSession(): SiteShellSessionState {
  const session = useContext(ShellSessionContext);
  return isPendingSiteShellSession(session) ? use(session) : session;
}

/**
 * The session once it is known, and `null` until then. It never suspends, and
 * only the component that calls it renders again when the answer arrives. The
 * first render — on the server and at hydration — answers `null` in a static
 * document, which is what keeps the two identical.
 */
export function useSettledShellSession(): SiteShellSessionState | null {
  return useValueStore(useContext(ShellStateContext).settledSession);
}

/**
 * The session if the document was *rendered* knowing it — a request-time
 * document — and `null` in a static one, for good. It never changes by itself,
 * so a component above the page may read it.
 */
export function useInitialShellSession(): SiteShellSessionState | null {
  const session = useContext(ShellSessionContext);
  return isPendingSiteShellSession(session) ? null : session;
}

/**
 * The same answer for an event handler: read when it is called, so a component
 * above the page can use the session without rendering again when it settles.
 */
export function useSettledShellSessionReader(): () => SiteShellSessionState | null {
  return useContext(ShellStateContext).settledSession.get;
}

/**
 * The address the reader is on, in the one spelling the prerender and the
 * browser agree on (`canonicalSiteShellPath`, ADR-0032 D3), read from the
 * router while rendering. **Request-time documents only**: a static one may
 * not call it on the server — see `ShellStateProvider`.
 */
export function useShellPathname(): string {
  return canonicalSiteShellPath(usePathname() || "/");
}

/** The address, or `null` while a static document has not hydrated. */
export function useShellPathnameValue(): string | null {
  return useValueStore(useContext(ShellStateContext).pathname);
}

function subscribeToNothing() {
  return () => undefined;
}

/**
 * True once the component has hydrated. For the rare client component that
 * must call a router hook a static document may not call while it prerenders.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export interface ShellRegionInput {
  /** `null` until a static document hydrates — draw the region without it. */
  pathname: string | null;
  /** `null` while nobody has said who is reading — draw the guest's. */
  session: SiteShellSessionState | null;
}

type ShellRegionRender = (input: ShellRegionInput) => React.ReactNode;

/**
 * One region of the chrome that depends on who is reading. `render` is a plain
 * function of what is known so far.
 *
 * With nothing known it returns what a static document carries in its bytes
 * and what a reader without JavaScript keeps: a working control for a guest,
 * never a skeleton. When the session arrives the same function renders again
 * into the same box, so the swap moves nothing (DESIGN.md §9, CLS ≤ 0.02).
 *
 * The boundary here is only ever *postponed* by a prerender — the session
 * never settles in one — which is the one kind of boundary a static document
 * may carry (see `ShellStateProvider`). And the address is read *inside* it, on
 * both sides: a region that read it outside would hand its own boundary new
 * props the moment the address arrived, which is the other way to make React
 * render a boundary it has not hydrated on the client (ADR-0032 D10).
 */
export function ShellRegion({ render }: { render: ShellRegionRender }) {
  return (
    <Suspense fallback={<GuestShellRegion render={render} />}>
      <ResolvedShellRegion render={render} />
    </Suspense>
  );
}

function GuestShellRegion({ render }: { render: ShellRegionRender }) {
  return <>{render({ pathname: useShellPathnameValue(), session: null })}</>;
}

function ResolvedShellRegion({ render }: { render: ShellRegionRender }) {
  const pathname = useShellPathnameValue();
  return <>{render({ pathname, session: useShellSession() })}</>;
}

/** A region that depends only on who is reading. */
export function ShellSessionRegion({
  render,
}: {
  render: (session: SiteShellSessionState | null) => React.ReactNode;
}) {
  return (
    <Suspense fallback={<>{render(null)}</>}>
      <ResolvedShellSessionRegion render={render} />
    </Suspense>
  );
}

function ResolvedShellSessionRegion({
  render,
}: {
  render: (session: SiteShellSessionState | null) => React.ReactNode;
}) {
  return <>{render(useShellSession())}</>;
}

/** A region that depends only on the address. No boundary: see above. */
export function ShellPathnameRegion({
  render,
}: {
  render: (pathname: string | null) => React.ReactNode;
}) {
  return <>{render(useShellPathnameValue())}</>;
}

/**
 * A region that depends on who is reading and is **not** in the served HTML —
 * a closed menu, a dialog's contents. It draws the guest's until the session is
 * known, needs no boundary, and nothing above it renders again.
 */
export function ShellSettledSessionRegion({
  render,
}: {
  render: (session: SiteShellSessionState | null) => React.ReactNode;
}) {
  return <>{render(useSettledShellSession())}</>;
}
