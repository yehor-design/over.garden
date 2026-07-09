import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PublicLocalizedHeader } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { publicProfilePath } from "@/lib/garden/public-paths";
import {
  getPublicProfilePageByHandle,
  type PublicProfilePage,
} from "@/server/public-profile-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

export const dynamic = "force-dynamic";

interface LocalizedPublicProfileRouteProps {
  params: Promise<{ locale: string; profileHandle: string }>;
}

const getCachedPublicProfilePage = cache((handle: string) =>
  getPublicProfilePageByHandle(handle),
);

export async function generateMetadata({
  params,
}: LocalizedPublicProfileRouteProps): Promise<Metadata> {
  const { locale: localeParam, profileHandle } = await params;
  const routeHandle = routeHandleFromSegment(profileHandle);
  const localeIsValid = isPublicLocale(localeParam);
  const copy = getPublicSurfaceCopy(localeIsValid ? localeParam : "uk");
  const page =
    localeIsValid && routeHandle
      ? await getCachedPublicProfilePage(routeHandle)
      : null;
  const indexState = evaluatePublicSurfaceIndexability({
    kind: page ? "profile" : "missing",
  });

  if (!localeIsValid || !page) {
    return {
      title: `${copy.profile.title} | OverGarden`,
      robots: indexState.robots,
    };
  }

  const basePath = `/@${page.handle}`;

  return {
    title: `${page.mention} · ${copy.profile.metadataSuffix} | OverGarden`,
    description: `${copy.profile.title}: ${page.mention}.`,
    alternates: {
      canonical: publicProfilePath(localeParam, page.handle),
      languages: buildLanguageAlternates(basePath),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function LocalizedPublicProfileRoute({
  params,
}: LocalizedPublicProfileRouteProps) {
  const { locale: localeParam, profileHandle } = await params;

  if (!isPublicLocale(localeParam)) notFound();
  const routeHandle = routeHandleFromSegment(profileHandle);
  if (!routeHandle) notFound();

  const page = await getCachedPublicProfilePage(routeHandle);
  if (!page) notFound();
  const copy = getPublicSurfaceCopy(localeParam);

  const basePath = `/@${page.handle}`;

  return (
    <main
      lang={localeParam}
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <PublicLocalizedHeader
        locale={localeParam}
        basePath={basePath}
        availableLocales={getLanguageSwitcherLocales(localeParam)}
      />

      <header className="flex flex-col gap-5 border-b border-border pb-6">
        <Link
          href={localizedPath(localeParam, "/")}
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PublicProfileAvatar page={page} locale={localeParam} />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {copy.profile.title}
            </p>
            <h1 className="font-mono text-3xl font-semibold tracking-tight break-words text-foreground sm:text-5xl">
              {page.mention}
            </h1>
            {page.displayName ? (
              <p className="text-base text-muted-foreground">
                {page.displayName}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label={copy.profile.publicEntries}
          value={page.summary.publicEntryCount}
        />
        <SummaryCard
          label={copy.profile.publicObjects}
          value={page.summary.publicObjectCount}
        />
        <SummaryCard
          label={copy.profile.confirmedLineageLinks}
          value={page.summary.confirmedLineageEdgeCount}
        />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {copy.profile.publicJournalLinks}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.profile.publicJournalLinksDescription}
          </p>
        </div>

        {page.links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.profile.noPublicJournalLinks}
          </p>
        ) : (
          <ol className="grid gap-3">
            {page.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex flex-col gap-1 rounded-lg border border-border p-4 transition-colors hover:bg-muted/60"
                >
                  <span className="font-medium text-foreground">
                    {copy.profile.publicJournalEntry}
                  </span>
                  <time className="text-sm text-muted-foreground">
                    {formatDate(link.entryDate, localeParam)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function PublicProfileAvatar({
  page,
  locale,
}: {
  page: PublicProfilePage;
  locale: "uk" | "bg" | "ru";
}) {
  if (!page.avatarUrl) {
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-xl font-semibold text-muted-foreground">
        {page.handle.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={page.avatarUrl}
      alt={`${page.mention} · ${getPublicSurfaceCopy(locale).profile.avatarSuffix}`}
      width={80}
      height={80}
      unoptimized
      className="size-20 shrink-0 rounded-lg border border-border object-cover"
    />
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function routeHandleFromSegment(segment: string) {
  return segment.startsWith("@") ? segment : null;
}

function formatDate(value: Date | string, locale: "uk" | "bg" | "ru") {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
