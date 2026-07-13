import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicJournalEntryView } from "@/components/public/public-journal-entry";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { normalizePublicJournalDirectoryReturnTo } from "@/lib/public-journal-directory-navigation";
import {
  buildLanguageAlternates,
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { resolveVisualSocialScenario } from "@/lib/visual-fixtures/social-return-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementSummary } from "@/server/engagement-repository";
import { getPublicJournalEntryLookup } from "@/server/journal-repository";
import { getOwnerJournalEntryControl } from "@/server/owner-journal-entry-control";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface PublicJournalEntryRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export async function generateMetadata({
  params,
}: PublicJournalEntryRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) return missingMetadata();

  const lookup = await getPublicJournalEntryLookup(
    slug,
    undefined,
    localeParam,
  ).catch(() => ({ status: "not_found" as const }));
  if (lookup.status !== "active") return missingMetadata();

  const copy = getPublicJournalEntryCopy(localeParam);
  const canonicalPath = publicJournalEntryPath(lookup.page.entry.publicSlug);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "journal_entry",
    publicNoindex: lookup.page.entry.publicNoindex,
  });

  return {
    title: `${lookup.page.entry.title} · ${copy.metadataTitleSuffix} | OverGarden`,
    description: summarize(lookup.page.entry.body),
    alternates: {
      canonical: canonicalPath,
      languages: buildLanguageAlternates(canonicalPath),
    },
    robots: indexState.robots,
    openGraph: { locale: localeParam },
  };
}

export default async function PublicJournalEntryRoute({
  params,
  searchParams,
}: PublicJournalEntryRouteProps) {
  const [{ locale: localeParam, slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  if (!isPublicLocale(localeParam)) notFound();

  const locale: PublicLocale = localeParam;
  const lookup = await getPublicJournalEntryLookup(slug, undefined, locale);
  if (lookup.status !== "active") notFound();

  const session = await getCurrentSession();
  const visualScenario = resolveVisualSocialScenario(
    query.visualSocial,
    "journal",
    process.env,
  );
  const userId = visualScenario?.actorId ?? session?.user?.id;
  const scope = userId
    ? scopedToUser(userId, visualScenario ? null : getSessionId(session))
    : null;
  const engagementTarget = {
    kind: "journal_entry" as const,
    ref: lookup.page.entry.publicSlug,
  };
  const [engagement, ownerControl] = await Promise.all([
    getEngagementSummary(engagementTarget, scope, {
      commentCursor: firstParam(query.cursor),
    }),
    scope
      ? getOwnerJournalEntryControl(scope, lookup.page.entry.publicSlug)
      : Promise.resolve(null),
  ]);
  const directoryReturnTo = normalizePublicJournalDirectoryReturnTo(
    firstParam(query.from),
    locale,
    Boolean(tryResolveVisualFixtureEnvironment(process.env)),
  );
  const engagementReturnTo = visualScenario
    ? `${lookup.page.entry.publicPath}?visualSocial=${visualScenario.id}`
    : lookup.page.entry.publicPath;

  return (
    <PublicJournalEntryView
      locale={locale}
      copy={getPublicJournalEntryCopy(locale)}
      page={lookup.page}
      directoryReturnTo={directoryReturnTo}
      ownerControl={ownerControl}
    >
      <PublicEngagementPanel
        isAuthenticated={Boolean(userId)}
        locale={locale}
        target={engagementTarget}
        summary={engagement}
        returnTo={engagementReturnTo}
        status={firstParam(query.engagement)}
        resumeAction={normalizeAuthIntentResumeAction(
          firstParam(query.authIntent) ?? undefined,
        )}
        resumeControl={normalizeAuthIntentResumeControl(
          firstParam(query.authControl) ?? undefined,
        )}
      />
    </PublicJournalEntryView>
  );
}

function missingMetadata(): Metadata {
  return {
    title: "Journal entry | OverGarden",
    robots: evaluatePublicSurfaceIndexability({ kind: "missing" }).robots,
  };
}

function summarize(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
