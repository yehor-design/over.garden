import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Bookmark, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  gardenFirstEntryPreselectionPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
  publicCatalogStatusLabel,
} from "@/lib/public-surface-localization";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { buildPublicVarietyJsonLd } from "@/server/public-variety-metadata";
import { getPublicVarietyPage } from "@/server/public-variety-repository";
import { getEngagementSummary } from "@/server/engagement-repository";
import { addCatalogPublicSlugToWishlistAction } from "@/app/wishlist/actions";
import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import { PublicVarietySourceCredits } from "./source-credits";

export const dynamic = "force-dynamic";

interface PublicVarietyRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_PUBLIC_VARIETY_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};

const getCachedPublicVarietyPage = cache((slug: string) =>
  getPublicVarietyPage(slug),
);

export async function generateMetadata({
  params,
}: PublicVarietyRouteProps): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
  ]);
  const copy = getPublicSurfaceCopy(locale);
  const page = await getCachedPublicVarietyPage(slug);

  if (!page) {
    const missingIndexState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: `${copy.variety.title} | OverGarden`,
      robots: missingIndexState.robots,
    };
  }

  const description = `${copy.variety.title}: ${page.catalog.canonicalName}.`;

  return {
    title: `${page.catalog.canonicalName} · ${copy.variety.metadataSuffix} | OverGarden`,
    description,
    alternates: {
      canonical: publicVarietyPath(page.catalog.publicSlug),
    },
    robots: page.indexState.robots,
  };
}

export default async function PublicVarietyRoute({
  params,
  searchParams,
}: PublicVarietyRouteProps) {
  const [{ slug }, query, locale, shellSession] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_VARIETY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
    getSiteShellSessionState(),
  ]);
  const copy = getPublicSurfaceCopy(locale);
  const page = await getCachedPublicVarietyPage(slug);

  if (!page) notFound();

  const jsonLd = buildPublicVarietyJsonLd(page, locale);
  const wishlistStatus = firstParam(query.wishlist);
  const engagementStatus = firstParam(query.engagement);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const engagementTarget = {
    kind: "variety" as const,
    ref: page.catalog.publicSlug,
  };
  const engagement = await getEngagementSummary(engagementTarget);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <header className="flex flex-col gap-5 border-b border-border pb-6">
        <Link
          href="/"
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {copy.variety.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.catalog.canonicalName}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {formatPublicCount(locale, "entry", page.entryCount)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {formatPublicCount(locale, "photo", page.photoCount)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {publicCatalogStatusLabel(locale, page.catalog.status)}
            </span>
          </div>
          <Link
            href={gardenFirstEntryPreselectionPath(page.catalog.publicSlug)}
            className={buttonVariants({
              size: "lg",
              className: "mt-2 self-start",
            })}
          >
            <Sprout className="size-4" />
            {copy.variety.logThisVariety}
          </Link>
          <form action={addCatalogPublicSlugToWishlistAction}>
            <input
              type="hidden"
              name="catalogPublicSlug"
              value={page.catalog.publicSlug}
            />
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="returnTo"
              value={publicVarietyPath(page.catalog.publicSlug)}
            />
            <button
              type="submit"
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              <Bookmark className="size-4" />
              {copy.variety.saveToWishlist}
            </button>
          </form>
          {wishlistStatus === "saved" ? (
            <p className="text-sm text-muted-foreground">
              {copy.variety.savedToWishlist}
            </p>
          ) : null}
        </div>
      </header>

      {page.seedProof ? (
        <section className="grid gap-4 border-b border-border pb-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {copy.variety.growingNote}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {page.seedProof.title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {page.seedProof.summary}
            </p>
          </div>
          <p className="max-w-3xl text-sm leading-6 whitespace-pre-wrap text-foreground">
            {page.seedProof.body}
          </p>
          {page.seedProof.sourceLabel ? (
            <p className="text-xs text-muted-foreground">
              {page.seedProof.sourceLabel}
            </p>
          ) : null}
        </section>
      ) : null}

      <PublicVarietySourceCredits
        locale={locale}
        credits={page.sourceCredits}
      />

      <PublicEngagementPanel
        isAuthenticated={shellSession.isAuthenticated}
        target={engagementTarget}
        summary={engagement}
        returnTo={publicVarietyPath(page.catalog.publicSlug)}
        status={engagementStatus}
        locale={locale}
        resumeAction={resumeAction}
        resumeControl={resumeControl}
      />

      <ol className="grid gap-4">
        {page.entries.map((entry) => (
          <li
            key={entry.id}
            className={`grid gap-4 rounded-lg border border-border p-4 ${
              entry.media ? "sm:grid-cols-3" : ""
            }`}
          >
            <article
              className={`flex min-w-0 flex-col gap-3 ${
                entry.media ? "sm:col-span-2" : ""
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time>{formatDate(entry.entryDate, locale)}</time>
                  {entry.safeLocationLabel ? (
                    <span>{entry.safeLocationLabel}</span>
                  ) : null}
                  <span>{entry.varietyText ?? page.catalog.canonicalName}</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  {entry.title}
                </h2>
              </div>
              <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                {entry.body}
              </p>
              <Link
                href={entry.publicPath}
                className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.variety.openSourceEntry}
              </Link>
            </article>

            {entry.media ? (
              <Image
                src={entry.media.publicUrl}
                alt={`${entry.title} · ${copy.passport.publicPhotoSuffix}`}
                width={448}
                height={252}
                sizes="(min-width: 640px) 14rem, 100vw"
                unoptimized
                className="aspect-video w-full rounded-md border border-border object-cover sm:w-56"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </main>
  );
}

function formatDate(value: Date | string, locale: "uk" | "bg" | "ru") {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
