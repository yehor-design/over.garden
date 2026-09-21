import { connection } from "next/server";
import { Suspense } from "react";

import { AfterHydration } from "@/components/site-shell/after-hydration";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { SiteShell } from "@/components/site-shell/site-shell";
import { OWNER_USER_ID_DOCUMENT_ATTRIBUTE } from "@/lib/auth/owner-scope-contract";
import { analyticsDocumentBootScript } from "@/lib/analytics-routes";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { siteShellDocumentBootScript } from "@/lib/site-shell-navigation";
import { readCommunityNavigationReadiness } from "@/server/public-cache";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";
import {
  GUEST_SITE_SHELL_SESSION_STATE,
  getSiteShellSessionState,
  type SiteShellSessionState,
} from "@/server/site-shell-session";
import { geistMono, googleSans } from "@/app/fonts";
import {
  AnalyticsConsentNotice,
  GoogleAnalytics,
} from "@/app/google-analytics";
import { MetaMarketingAttribution } from "@/app/meta-marketing";
import "@/app/globals.css";

/**
 * The two documents the product serves (ADR-0022 D4, ADR-0032).
 *
 * **A static document** is every public page. Its language is in its route,
 * so the chrome, the page and the page's photograph are all part of the
 * prerendered shell: they are in the first bytes, outside any `<div hidden>`,
 * and they paint without React's runtime. The one thing a prerender cannot
 * know is who is reading, so the session is *started* here and never awaited —
 * the promise travels into the shell and the few regions that differ between a
 * guest and a gardener wait for it on their own (`ShellSessionRegion`).
 *
 * **A request-time document** is the workspace, the account and the sign-in
 * screens. Its address carries no language — the reader's does — so the locale,
 * the market and the session are resolved per request, behind one boundary,
 * exactly as every document was before `OVE-461`. Those screens are `no-store`
 * and signed-in; nothing about them is a landing page.
 *
 * What this replaced wrapped *every* document in that one boundary. The served
 * HTML painted a skeleton, the real page arrived inside `<div hidden>`, and
 * React's inline runtime revealed it no sooner than 300 ms after first paint —
 * by which time the bundle had run, so Lighthouse measured LCP at TTI (5.16 s
 * on production's `/`, 2026-09-19) and a reader without JavaScript saw nothing.
 */
export function StaticRootDocument({
  locale,
  children,
}: {
  /** The route's language: `[locale]`'s param, or the default tree's own. */
  locale: InterfaceLocale;
  children: React.ReactNode;
}) {
  // Started, not awaited. Awaiting it here is the one line that would put the
  // whole document back behind a boundary.
  const session = getSiteShellSessionState();

  return (
    <DocumentFrame lang={locale}>
      <StaticDocumentShell locale={locale} session={session}>
        {children}
      </StaticDocumentShell>
    </DocumentFrame>
  );
}

/** The chrome of a static document. The readiness read is cached and tagged. */
export async function StaticDocumentShell({
  locale,
  session,
  children,
}: {
  locale: InterfaceLocale;
  session: Promise<SiteShellSessionState>;
  children: React.ReactNode;
}) {
  // The one read the chrome makes, and the one place a static shell settles a
  // failure instead of deferring it (ADR-0032 D4): there is no boundary here to
  // defer *into*, and the chrome must be in the first bytes. What bounds it is
  // the cache above the read: while the cached answer lives the database is
  // not asked at all, so `false` takes a cold cache and a database that is down
  // in the same moment — and a failed call is not stored, so the next
  // regeneration of the shell asks again.
  const communitiesReady = await readCommunityNavigationReadiness().catch(
    () => false,
  );

  return (
    <div lang={locale} className="contents">
      <SiteShell
        document="static"
        locale={locale}
        session={session}
        communitiesReady={communitiesReady}
      >
        {children}
      </SiteShell>
      {/* The notice is part of the document's bytes and is drawn by CSS from
          what `<html>` says before first paint (ADR-0032 D7). The tags are not:
          they decide from the address whether they run at all, and a static
          document does not read its address while it prerenders (D3). They
          draw nothing, so they mount with the bundle that runs them. */}
      <AnalyticsConsentNotice locale={locale} />
      <AfterHydration>
        <GoogleAnalytics />
      </AfterHydration>
      <AfterHydration>
        <MetaMarketingAttribution locale={locale} />
      </AfterHydration>
    </div>
  );
}

export function RequestRootDocument({
  lang,
  children,
}: {
  /** The document language; static for the whole route tree. */
  lang: InterfaceLocale;
  children: React.ReactNode;
}) {
  return (
    <DocumentFrame lang={lang}>
      <Suspense fallback={<RootLoadingSkeleton />}>
        <RequestDocumentShell>{children}</RequestDocumentShell>
      </Suspense>
    </DocumentFrame>
  );
}

/** The request-time part of a workspace document: locale, session, shell. */
export async function RequestDocumentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const { locale, market } = await getRequestInterfaceLocalization();
  const [shellSession, communitiesReady] = await Promise.all([
    getShellSessionState(),
    readCommunityNavigationReadiness().catch(() => false),
  ]);

  return (
    <div
      lang={locale}
      className="contents"
      {...(shellSession.ownerUserId
        ? { [OWNER_USER_ID_DOCUMENT_ATTRIBUTE]: shellSession.ownerUserId }
        : {})}
    >
      <SiteShell
        locale={locale}
        market={market}
        session={shellSession}
        communitiesReady={communitiesReady}
      >
        {children}
      </SiteShell>
      {/* The same notice a static document draws, for the same reason: a
          banner React renders from the stored answer is rendered on the server
          as if nobody had answered, and flashed on every hard load for the
          reader who had. */}
      <AnalyticsConsentNotice locale={locale} />
      <GoogleAnalytics />
      <MetaMarketingAttribution locale={locale} />
    </div>
  );
}

function DocumentFrame({
  lang,
  children,
}: {
  lang: InterfaceLocale;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={lang}
      className={`${googleSans.variable} ${geistMono.variable} h-full antialiased`}
      // The inline script below writes two `data-*` attributes here before
      // React hydrates; they are the document's, not the tree's.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <script
          // Runs while the parser is still in `<body>`'s first bytes, so what
          // it writes is true for the first paint.
          dangerouslySetInnerHTML={{
            __html: `${siteShellDocumentBootScript()};${analyticsDocumentBootScript()}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}

async function getShellSessionState(): Promise<SiteShellSessionState> {
  try {
    return await getSiteShellSessionState();
  } catch {
    return GUEST_SITE_SHELL_SESSION_STATE;
  }
}
