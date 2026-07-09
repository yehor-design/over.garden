import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  GitBranch,
  MapPin,
  ShieldCheck,
  Sprout,
  UserRound,
} from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
  publicCatalogIdentityLabel,
  publicObjectKindLabel,
  publicVarietyStateLabel,
} from "@/lib/public-surface-localization";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getEngagementSummary } from "@/server/engagement-repository";
import { listLineageInteractionTargets } from "@/server/lineage-interactions-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import {
  getPublicLineageGraphPage,
  type PublicLineageEdge,
  type PublicLineageGraphPage,
  type PublicLineageNode,
} from "@/server/public-lineage-repository";
import {
  getPublicObjectPassportPage,
  type PublicObjectPassportPage,
} from "@/server/public-object-passport-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser } from "@/server/request-scope";
import { askLineageQuestionAction, followLineageNodeAction } from "./actions";

export const dynamic = "force-dynamic";

interface PublicLineageObjectRouteProps {
  params: Promise<{ objectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};

const getCachedPublicObjectPassportPage = cache((objectId: string) =>
  getPublicObjectPassportPage(objectId),
);

const getCachedPublicLineageGraphPage = cache((objectId: string) =>
  getPublicLineageGraphPage(objectId),
);

export async function generateMetadata({
  params,
}: PublicLineageObjectRouteProps): Promise<Metadata> {
  const [{ objectId }, locale] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
  ]);
  const copy = getPublicSurfaceCopy(locale);
  const page = await getCachedPublicObjectPassportPage(objectId);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: page ? "object_passport" : "missing",
  });

  if (!page) {
    return {
      title: `${copy.passport.title} | OverGarden`,
      robots: indexState.robots,
    };
  }

  return {
    title: `${page.object.displayName} · ${copy.passport.metadataSuffix} | OverGarden`,
    description: `${copy.passport.title}: ${page.object.displayName}.`,
    alternates: {
      canonical: publicLineageObjectPath(page.object.plantObjectId),
    },
    robots: indexState.robots,
  };
}

export default async function PublicLineageObjectRoute({
  params,
  searchParams,
}: PublicLineageObjectRouteProps) {
  const [{ objectId }, query, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const passport = await getCachedPublicObjectPassportPage(objectId);

  if (!passport) notFound();

  const lineagePage = await getCachedPublicLineageGraphPage(
    passport.object.plantObjectId,
  );
  const nodesById = buildPublicLineageNodeMap(passport, lineagePage);
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const writeAccess = scope
    ? await resolvePilotWriteAccess(scope)
    : { invited: false };
  const edges = lineagePage?.edges ?? [];
  const interactionTargets =
    scope && writeAccess.invited && edges.length > 0
      ? await listLineageInteractionTargets(
          scope,
          edges.map((edge) => edge.id),
        )
      : [];
  const interactionTargetsByEdgeId = new Map(
    interactionTargets.map((target) => [target.edgeId, target]),
  );
  const engagementTarget = {
    kind: "lineage_object" as const,
    ref: passport.object.plantObjectId,
  };
  const returnTo = publicLineageObjectPath(passport.object.plantObjectId);
  const engagement = await getEngagementSummary(engagementTarget);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <PublicObjectPassportHero passport={passport} locale={locale} />

      <PublicEngagementPanel
        target={engagementTarget}
        summary={engagement}
        returnTo={returnTo}
        status={firstParam(query.engagement)}
        locale={locale}
      />

      <PublicJournalPreviewSection passport={passport} locale={locale} />

      <RelatedPublicContext passport={passport} locale={locale} />

      <section className="grid gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <GitBranch className="size-4" />
            {getPublicSurfaceCopy(locale).passport.confirmedProvenance}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {getPublicSurfaceCopy(locale).passport.publicLineage}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {getPublicSurfaceCopy(locale).passport.publicLineageDescription}
          </p>
        </div>

        {edges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {getPublicSurfaceCopy(locale).passport.noConfirmedPublicLineage}
          </p>
        ) : (
          <ol className="grid gap-4">
            {edges.map((edge) => {
              const subject = nodesById.get(edge.subjectPlantObjectId);
              const source = nodesById.get(edge.sourcePlantObjectId);
              if (!subject || !source) return null;
              const interactionTargetId = interactionTargetsByEdgeId.get(
                edge.id,
              )?.targetPlantObjectId;
              const interactionTarget = interactionTargetId
                ? nodesById.get(interactionTargetId)
                : null;

              return (
                <PublicLineageEdgeCard
                  key={edge.id}
                  edge={edge}
                  subject={subject}
                  source={source}
                  rootPlantObjectId={passport.object.plantObjectId}
                  interactionTarget={interactionTarget ?? null}
                  locale={locale}
                />
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

function PublicObjectPassportHero({
  passport,
  locale,
}: {
  passport: PublicObjectPassportPage;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);
  const object = passport.object;
  const primaryIdentity =
    object.varietyText ??
    object.catalogCanonicalName ??
    copy.journal.catalogMatchPending;

  return (
    <header className="grid gap-6 border-b border-border pb-6 lg:grid-cols-3 lg:items-start">
      <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sprout className="size-4" />
            {copy.passport.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {object.displayName}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {publicObjectKindLabel(locale, object.objectKind)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {primaryIdentity}
            </span>
            {object.safeLocationLabel ? (
              <span className="rounded-md border border-border px-2 py-1">
                {object.safeLocationLabel}
              </span>
            ) : null}
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PassportFact
            icon={<BookOpen className="size-4" />}
            label={copy.passport.publicJournal}
            value={formatPublicCount(locale, "entry", object.publicEntryCount)}
          />
          <PassportFact
            icon={<CalendarDays className="size-4" />}
            label={copy.passport.latestUpdate}
            value={formatDate(object.latestEntryDate, locale)}
          />
          <PassportFact
            icon={<ShieldCheck className="size-4" />}
            label={copy.passport.catalogState}
            value={publicVarietyStateLabel(locale, object.varietyState)}
          />
          <PassportFact
            icon={<Sprout className="size-4" />}
            label={publicCatalogIdentityLabel(
              locale,
              object.catalogKind,
              object.objectKind,
            )}
            value={object.catalogCanonicalName ?? primaryIdentity}
          />
          <PassportFact
            icon={<MapPin className="size-4" />}
            label={copy.passport.location}
            value={object.safeLocationLabel ?? copy.passport.hidden}
          />
          <PassportFact
            icon={<UserRound className="size-4" />}
            label={copy.passport.caretaker}
            value={
              passport.author?.displayName ?? copy.passport.defaultCaretaker
            }
          />
        </dl>

        <div className="flex flex-wrap gap-3">
          <Link
            href={gardenObjectActivationPath(object.plantObjectId)}
            className={buttonVariants({ size: "lg", className: "self-start" })}
          >
            <Sprout className="size-4" />
            {copy.passport.startOwnRecord}
          </Link>
          {object.catalogPath ? (
            <Link
              href={object.catalogPath}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "self-start",
              })}
            >
              {copy.passport.openCatalogMatch}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        <PassportCover passport={passport} locale={locale} />
        {passport.author ? (
          <Link
            href={passport.author.profilePath}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {passport.author.displayName}
              </span>
              <span className="block truncate text-muted-foreground">
                {passport.author.mention}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function PassportCover({
  passport,
  locale,
}: {
  passport: PublicObjectPassportPage;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  if (!passport.coverMediaPublicUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
        {copy.passport.noPublicPhoto}
      </div>
    );
  }

  return (
    <Image
      src={passport.coverMediaPublicUrl}
      alt={`${passport.object.displayName} · ${copy.passport.publicPhotoSuffix}`}
      width={704}
      height={396}
      sizes="(min-width: 1024px) 22rem, 100vw"
      unoptimized
      className="aspect-video w-full rounded-lg border border-border object-cover"
      priority
    />
  );
}

function PassportFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
        {icon}
        {label}
      </dt>
      <dd className="text-sm leading-5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function PublicJournalPreviewSection({
  passport,
  locale,
}: {
  passport: PublicObjectPassportPage;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BookOpen className="size-4" />
          {copy.passport.recentPublicJournal}
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.passport.logbookPreview}
        </h2>
      </div>

      {passport.journalPreview.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.passport.noPublicJournalEntries}
        </p>
      ) : (
        <ol className="grid gap-4">
          {passport.journalPreview.map((entry) => (
            <li
              key={entry.id}
              className={`grid gap-4 rounded-lg border border-border p-4 ${
                entry.mediaPublicUrl ? "sm:grid-cols-3" : ""
              }`}
            >
              <article
                className={`flex min-w-0 flex-col gap-3 ${
                  entry.mediaPublicUrl ? "sm:col-span-2" : ""
                }`}
              >
                <div className="flex flex-col gap-1">
                  <time className="text-xs text-muted-foreground">
                    {formatDate(entry.entryDate, locale)}
                  </time>
                  <h3 className="text-base font-semibold text-foreground">
                    {entry.title}
                  </h3>
                </div>
                <p className="text-sm leading-6 text-foreground">
                  {entry.bodyPreview}
                </p>
                <Link
                  href={entry.publicPath}
                  className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {copy.passport.openJournalEntry}
                </Link>
              </article>

              {entry.mediaPublicUrl ? (
                <Image
                  src={entry.mediaPublicUrl}
                  alt={`${entry.title} · ${copy.passport.publicPhotoSuffix}`}
                  width={384}
                  height={216}
                  sizes="(min-width: 640px) 12rem, 100vw"
                  unoptimized
                  className="aspect-video w-full rounded-md border border-border object-cover sm:w-48"
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RelatedPublicContext({
  passport,
  locale,
}: {
  passport: PublicObjectPassportPage;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">
          {copy.passport.relatedPublicContext}
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.passport.exploreObject}
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {passport.object.catalogPath ? (
          <RelatedContextLink
            href={passport.object.catalogPath}
            label={copy.passport.catalogMatch}
            value={
              passport.object.catalogCanonicalName ??
              passport.object.varietyText ??
              copy.passport.publicCatalog
            }
          />
        ) : null}
        {passport.author ? (
          <RelatedContextLink
            href={passport.author.profilePath}
            label={copy.passport.caretaker}
            value={passport.author.displayName}
          />
        ) : null}
        <RelatedContextLink
          href={publicLineageObjectPath(passport.object.plantObjectId)}
          label={copy.passport.objectHistory}
          value={copy.passport.confirmedProvenance}
        />
      </div>
    </section>
  );
}

function RelatedContextLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 text-sm transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground uppercase">
          {label}
        </span>
        <span className="block truncate font-medium text-foreground">
          {value}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function PublicLineageEdgeCard({
  edge,
  subject,
  source,
  rootPlantObjectId,
  interactionTarget,
  locale,
}: {
  edge: PublicLineageEdge;
  subject: PublicLineageNode;
  source: PublicLineageNode;
  rootPlantObjectId: string;
  interactionTarget: PublicLineageNode | null;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {source.displayName} → {subject.displayName}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.passport.depth} {edge.depth}
          </span>
          <time className="rounded-md border border-border px-2 py-1">
            {formatDate(edge.createdAt, locale)}
          </time>
        </div>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <PublicLineageNodeDescription
          label={copy.passport.source}
          node={source}
          locale={locale}
        />
        <PublicLineageNodeDescription
          label={copy.passport.grownObject}
          node={subject}
          locale={locale}
        />
      </dl>

      {interactionTarget ? (
        <LineageInteractionPanel
          edge={edge}
          rootPlantObjectId={rootPlantObjectId}
          target={interactionTarget}
          locale={locale}
        />
      ) : null}
    </li>
  );
}

function LineageInteractionPanel({
  edge,
  rootPlantObjectId,
  target,
  locale,
}: {
  edge: PublicLineageEdge;
  rootPlantObjectId: string;
  target: PublicLineageNode;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {copy.passport.lineageUpdatesFrom} {target.displayName}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy.passport.lineageQuestionSafety}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <form action={followLineageNodeAction}>
          <input type="hidden" name="edgeId" value={edge.id} />
          <input
            type="hidden"
            name="targetPlantObjectId"
            value={target.plantObjectId}
          />
          <input
            type="hidden"
            name="rootPlantObjectId"
            value={rootPlantObjectId}
          />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "w-full md:w-auto",
            })}
          >
            {copy.passport.followUpdates}
          </button>
        </form>

        <form action={askLineageQuestionAction} className="grid gap-2">
          <input type="hidden" name="edgeId" value={edge.id} />
          <input
            type="hidden"
            name="targetPlantObjectId"
            value={target.plantObjectId}
          />
          <input
            type="hidden"
            name="rootPlantObjectId"
            value={rootPlantObjectId}
          />
          <input
            type="hidden"
            name="clientMutationId"
            value={crypto.randomUUID()}
          />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              {copy.passport.askWithinLineage}
            </span>
            <textarea
              name="questionText"
              required
              maxLength={360}
              rows={3}
              placeholder={copy.passport.lineageQuestionPlaceholder}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
            />
          </label>
          <button
            type="submit"
            className={buttonVariants({ className: "justify-self-start" })}
          >
            {copy.passport.sendQuestion}
          </button>
        </form>
      </div>
    </div>
  );
}

function PublicLineageNodeDescription({
  label,
  node,
  locale,
}: {
  label: string;
  node: PublicLineageNode;
  locale: InterfaceLocale;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase">{label}</dt>
      <dd className="font-medium text-foreground">{node.displayName}</dd>
      <dd>
        <PublicLineageNodeMeta node={node} compact locale={locale} />
      </dd>
    </div>
  );
}

function PublicLineageNodeMeta({
  node,
  compact = false,
  locale,
}: {
  node: PublicLineageNode;
  compact?: boolean;
  locale: InterfaceLocale;
}) {
  const meta = [
    publicObjectKindLabel(locale, node.objectKind),
    node.varietyText ??
      node.catalogCanonicalName ??
      getPublicSurfaceCopy(locale).journal.catalogMatchPending,
    node.safeLocationLabel,
  ].filter(Boolean);

  return (
    <div
      className={`flex flex-wrap gap-2 text-xs text-muted-foreground ${
        compact ? "" : "mt-1"
      }`}
    >
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
      {node.catalogPublicSlug ? (
        <Link
          href={publicVarietyPath(node.catalogPublicSlug)}
          className="rounded-md border border-border px-2 py-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {node.catalogCanonicalName ??
            getPublicSurfaceCopy(locale).passport.publicCatalog}
        </Link>
      ) : null}
    </div>
  );
}

function buildPublicLineageNodeMap(
  passport: PublicObjectPassportPage,
  lineagePage: PublicLineageGraphPage | null,
) {
  const rootNode: PublicLineageNode = {
    plantObjectId: passport.object.plantObjectId,
    displayName: passport.object.displayName,
    objectKind: passport.object.objectKind,
    varietyText: passport.object.varietyText,
    varietyState: passport.object.varietyState,
    catalogKind: passport.object.catalogKind,
    catalogCanonicalName: passport.object.catalogCanonicalName,
    catalogPublicSlug: passport.object.catalogPublicSlug,
    safeLocationLabel: passport.object.safeLocationLabel,
  };
  const nodes = lineagePage?.nodes ?? [rootNode];

  return new Map(nodes.map((node) => [node.plantObjectId, node]));
}

function gardenObjectActivationPath(plantObjectId: string) {
  const params = new URLSearchParams({
    source: "public-object",
    object: plantObjectId,
  });

  return `/garden?${params.toString()}`;
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
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
