import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Bookmark, NotebookPen } from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicVarietySourceCredits } from "@/app/(default)/variety/[slug]/source-credits";
import { addCatalogPublicSlugToWishlistAction } from "@/app/(default)/wishlist/actions";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { buttonVariants } from "@/components/ui/button";
import type { CatalogKind } from "@/db/schema";
import {
  gardenCatalogPreselectionPath,
  gardenFirstEntryPreselectionPath,
} from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
  publicCatalogStatusLabel,
} from "@/lib/public-surface-localization";
import { getEngagementSummary } from "@/server/engagement-repository";
import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicVarietySurfaceMetadata } from "@/server/public-variety-metadata";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import {
  formatOrganismDate,
  formatOrganismFactParagraph,
} from "@/lib/public-organism-copy";
import {
  hasAcceptedNameDisagreement,
  type PublicOrganismAssertionLine,
} from "@/server/public-organism-card-query";
import { buildPublicVarietyDiscoverySource } from "@/server/public-variety-repository";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import { isOwnerUserId } from "@/server/admin-access";
import {
  listCatalogCardNames,
  listOwnerActionAudit,
} from "@/server/owner-action-audit";
import { CatalogOwnerCardControls } from "@/app/catalog-owner-card-controls";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";
import {
  readPublicCatalogAddress,
  readPublicVarietyPageByCatalogItemId,
} from "@/server/public-cache";
import type { PublicCatalogAddressRequest } from "@/lib/catalog/addresses";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";

export interface PublicCatalogEvidenceRouteProps {
  params: Promise<{ slug: string; form?: string; locale?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** The route family a page file serves; the address it resolves may differ. */
export type PublicCatalogEvidenceFamily = CatalogKind;

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

const getCachedCatalogAddress = cache((request: PublicCatalogAddressRequest) =>
  readPublicCatalogAddress(request),
);

const getCachedPublicCatalogEvidencePage = cache(
  (catalogItemId: string, locale: InterfaceLocale) =>
    readPublicVarietyPageByCatalogItemId(catalogItemId, locale),
);

/**
 * Resolves what a page file was asked for (ADR-0026 D8). On a hard load the
 * proxy has already answered 308 or 404 with a real status; here the same
 * lookup serves client-side navigations, and the page never renders one
 * organism under another organism's address.
 */
async function resolveCatalogEvidenceRequest(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
) {
  const [{ slug, form, locale: localeParam }, query] = await Promise.all([
    props.params,
    props.searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  const locale: InterfaceLocale | null = localeParam
    ? isPublicLocale(localeParam)
      ? localeParam
      : null
    : await getRequestInterfaceLocale();
  // The route family decides the canonical and every redirect target: a
  // prefixed page stays prefixed, the unprefixed page stays unprefixed
  // whatever the cookie locale says.
  const routeLocale: PublicLocale =
    localeParam && isPublicLocale(localeParam)
      ? localeParam
      : DEFAULT_PUBLIC_LOCALE;
  const request: PublicCatalogAddressRequest =
    family === "species"
      ? { kind: "species", speciesSlug: slug, formSlug: form ?? null }
      : { kind: "legacy", catalogKind: family, slug };
  const address = locale ? await getCachedCatalogAddress(request) : null;
  return { locale, routeLocale, query, address };
}

export async function generatePublicCatalogEvidenceMetadata(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  const { locale, routeLocale, address } = await resolveCatalogEvidenceRequest(
    family,
    props,
  );
  const missing = () => ({
    title: `${getCatalogEvidenceCopy(locale ?? "uk", family).title} | OverGarden`,
    robots:
      resolveUnresolvedPublicSurfaceDiscovery("catalog_evidence").decision
        .robots,
  });
  if (!locale || !address || address.status !== "canonical") return missing();

  const bounded = await resolvePublicSurfacePayload({
    consumerId: "catalog_evidence",
    load: async () => {
      const page = await getCachedPublicCatalogEvidencePage(
        address.catalogItemId,
        locale,
      );
      if (!page) throw new Error("Public catalog evidence unavailable.");
      return {
        source: buildPublicVarietyDiscoverySource(
          page,
          "catalog_evidence",
          routeLocale,
        ),
        payload: page,
      };
    },
  });
  const page = bounded.payload;
  if (!page) return missing();

  const routeCopy = getCatalogEvidenceCopy(locale, page.catalog.catalogKind);
  const surface = buildPublicVarietySurfaceMetadata(page, locale, {
    routeLocale,
    discovery: bounded,
  });
  return {
    ...surface.metadata,
    title: `${page.catalog.canonicalName} · ${routeCopy.metadataSuffix} | OverGarden`,
    description: `${routeCopy.title}: ${page.catalog.canonicalName}.`,
  };
}

export async function renderPublicCatalogEvidenceRoute(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
) {
  const { locale, routeLocale, query, address } =
    await resolveCatalogEvidenceRequest(family, props);
  if (!locale || !address || address.status === "not_found") notFound();
  if (address.status === "redirect") {
    permanentRedirect(localizedPath(routeLocale, address.canonicalPath));
  }
  const [shellSession, page] = await Promise.all([
    getSiteShellSessionState(),
    getCachedPublicCatalogEvidencePage(address.catalogItemId, locale),
  ]);
  if (!page) notFound();

  // The owner's edit controls (ADR-0026 D10) render only for the owner's own
  // session; a signed-in gardener and a guest see the same card without them.
  const isOwner = shellSession.ownerUserId
    ? await isOwnerUserId(shellSession.ownerUserId).catch(() => false)
    : false;
  // Two owner-only reads, and only for the owner: the names the card can pin
  // and what has already been done to it. A failure costs the controls their
  // lists, never the card.
  const [ownerNames, ownerAudit] = isOwner
    ? await Promise.all([
        listCatalogCardNames(address.catalogItemId).catch(() => []),
        listOwnerActionAudit({
          catalogItemId: address.catalogItemId,
          limit: 8,
        }).catch(() => []),
      ])
    : [[], []];

  const catalogKind = page.catalog.catalogKind;
  const publicCopy = getPublicSurfaceCopy(locale);
  const routeCopy = getCatalogEvidenceCopy(locale, catalogKind);
  const publicPath = localizedPath(routeLocale, page.catalog.canonicalPath);
  const surface = buildPublicVarietySurfaceMetadata(page, locale, {
    routeLocale,
  });
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);
  const isPlantVariety = catalogKind === "plant_variety";
  const wishlistStatus = firstParam(query.wishlist);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const engagementTarget = {
    kind: "variety" as const,
    ref: page.catalog.publicSlug,
  };
  // A variety is a public engagement target only once it has public entries
  // (`buildPublicVarietyTargetQuery`): an organism without them renders with
  // no panel, and a refused panel never takes the page down.
  const engagement =
    isPlantVariety && page.entryCount > 0
      ? await getEngagementSummary(engagementTarget).catch((reason: unknown) => {
          recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
            surface: "engagement_panel",
            section: "summary",
          });
          return null;
        })
      : null;
  const likeState = engagement
    ? await readViewerLikeState(engagementTarget)
    : null;

  const cardCopy = publicCopy.organism;
  const factParagraph = formatOrganismFactParagraph(locale, {
    canonicalName: page.catalog.canonicalName,
    catalogKind,
    speciesName: page.catalog.species?.canonicalName ?? null,
    formCount: page.card.formCount,
    gardenerCount: page.card.gardenerCount,
    regionCount: page.card.regions.length,
  });
  const hasExperience =
    page.entries.length > 0 || page.card.regions.length > 0;
  const relationGroups = [
    { key: "forms", heading: cardCopy.sections.forms, items: page.card.forms },
    { key: "pests", heading: cardCopy.sections.pests, items: page.card.pests },
    { key: "hosts", heading: cardCopy.sections.hosts, items: page.card.hosts },
  ].filter((group) => group.items.length > 0);
  const disagreement = hasAcceptedNameDisagreement(
    page.card.acceptedNameClaims,
  );

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <header
        data-organism-section="facts"
        className="flex flex-col gap-5 border-b border-border pb-6"
      >
        <Link
          href={`/objects?identity=${catalogKind}`}
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          {routeCopy.backToCatalog}
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {routeCopy.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.catalog.canonicalName}
          </h1>
          <p
            data-organism-fact
            className="max-w-3xl text-base leading-7 text-foreground"
          >
            {factParagraph}
          </p>
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
            href={
              isPlantVariety
                ? gardenFirstEntryPreselectionPath(page.catalog.publicSlug)
                : gardenCatalogPreselectionPath(page.catalog.publicSlug)
            }
            className={buttonVariants({
              size: "lg",
              className: "mt-2 self-start",
            })}
          >
            <NotebookPen className="size-4" />
            {routeCopy.logThisIdentity}
          </Link>
          {isPlantVariety ? (
            <OwnerScopedActionForm
              action={addCatalogPublicSlugToWishlistAction}
            >
              <input
                type="hidden"
                name="catalogPublicSlug"
                value={page.catalog.publicSlug}
              />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="returnTo" value={publicPath} />
              <button
                type="submit"
                className={buttonVariants({
                  variant: "outline",
                  className: "self-start",
                })}
              >
                <Bookmark className="size-4" />
                {publicCopy.variety.saveToWishlist}
              </button>
            </OwnerScopedActionForm>
          ) : null}
          {isPlantVariety && wishlistStatus === "saved" ? (
            <p className="text-sm text-muted-foreground">
              {publicCopy.variety.savedToWishlist}
            </p>
          ) : null}
        </div>
      </header>

      {isPlantVariety && page.seedProof ? (
        <section className="grid gap-4 border-b border-border pb-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {publicCopy.variety.growingNote}
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

      {hasExperience ? (
        <section
          aria-labelledby="organism-experience-heading"
          data-organism-section="experience"
          className="grid gap-5 border-b border-border pb-6"
        >
          <h2
            id="organism-experience-heading"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            {cardCopy.sections.experience}
          </h2>

          {isPlantVariety && engagement ? (
            <PublicEngagementPanel
              isAuthenticated={shellSession.isAuthenticated}
              target={engagementTarget}
              likeState={likeState}
              summary={engagement}
              returnTo={publicPath}
              locale={locale}
              resumeAction={resumeAction}
              resumeControl={resumeControl}
            />
          ) : null}

          {page.card.regions.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                {cardCopy.sections.spread}
              </h3>
              <ul
                data-organism-spread
                className="grid gap-1 text-sm text-foreground sm:grid-cols-2"
              >
                {page.card.regions.map((region) => (
                  <li
                    key={region.code}
                    className="flex flex-wrap justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span>{region.label ?? region.code}</span>
                    <span className="text-muted-foreground">
                      {formatPublicCount(locale, "object", region.objectCount)}
                      {" · "}
                      {formatPublicCount(locale, "gardener", region.gardenerCount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {page.entries.length > 0 ? (
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
                        <span>
                          {entry.varietyText ?? page.catalog.canonicalName}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {entry.title}
                      </h3>
                    </div>
                    <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                      {entry.body}
                    </p>
                    <Link
                      href={entry.publicPath}
                      className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {publicCopy.variety.openSourceEntry}
                    </Link>
                  </article>

                  {entry.media ? (
                    <SubjectAwareMediaImage
                      src={entry.media.publicUrl}
                      srcSet={buildPublicMediaSourceSet(entry.media).srcSet}
                      placeholderDataUri={entry.media.placeholderDataUri}
                      alt={`${entry.title} · ${publicCopy.passport.publicPhotoSuffix}`}
                      width={448}
                      height={252}
                      sizes="(min-width: 640px) 14rem, 100vw"
                      presentationMode="cover"
                      intrinsicWidth={entry.media.intrinsicWidth}
                      intrinsicHeight={entry.media.intrinsicHeight}
                      className="aspect-video w-full rounded-md border border-border sm:w-56"
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {relationGroups.length > 0 ? (
        <section
          aria-labelledby="organism-relations-heading"
          data-organism-section="relations"
          className="grid gap-4 border-b border-border pb-6"
        >
          <h2
            id="organism-relations-heading"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            {cardCopy.sections.relations}
          </h2>
          {relationGroups.map((group) => (
            <div key={group.key} className="grid gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                {group.heading}
              </h3>
              <ul
                data-organism-relations={group.key}
                className="flex flex-wrap gap-2"
              >
                {group.items.map((item) => (
                  <li key={item.catalogItemId}>
                    <Link
                      href={localizedPath(routeLocale, item.publicPath)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <span>{item.canonicalName}</span>
                      {item.hostClass ? (
                        <span className="text-xs text-muted-foreground">
                          · {hostClassLabel(cardCopy, item.hostClass)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {page.card.sourceGroups.length > 0 ? (
        <details
          data-organism-section="names-and-sources"
          className="rounded-lg border border-border p-4"
        >
          <summary className="cursor-pointer">
            <h2 className="inline text-2xl font-semibold tracking-tight text-foreground">
              {cardCopy.sections.namesAndSources}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cardCopy.sections.namesAndSourcesHint}
            </p>
          </summary>
          <div className="mt-4 grid gap-5">
            {disagreement ? (
              <div
                data-organism-disagreement
                className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
              >
                <p className="font-medium text-foreground">
                  {cardCopy.sections.disagreement}
                </p>
                <ul className="mt-1 grid gap-1 text-muted-foreground">
                  {page.card.acceptedNameClaims.map((claim) => (
                    <li key={`${claim.sourceName}:${claim.name}`}>
                      {claim.sourceName}:{" "}
                      <span className="italic text-foreground">{claim.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {page.card.sourceGroups.map((group) => {
              const observed = formatOrganismDate(locale, group.observedAt);
              return (
                <div
                  key={`${group.sourceSlug ?? "catalog"}:${group.sourceVersion ?? ""}`}
                  className="grid gap-2"
                >
                  <h3 className="text-lg font-semibold text-foreground">
                    {group.sourceName}
                    {group.sourceVersion ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {publicCopy.sourceCredits.versionLabel}: {group.sourceVersion}
                      </span>
                    ) : null}
                    {observed ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {cardCopy.sections.observedOn}: {observed}
                      </span>
                    ) : null}
                  </h3>
                  <ul className="grid gap-1 text-sm">
                    {group.lines.map((line, index) => (
                      <li key={`${line.kind}:${line.label}:${index}`} className="flex flex-wrap gap-x-2">
                        <span className="text-muted-foreground">
                          {assertionLabel(cardCopy, line)}:
                        </span>
                        <span className="text-foreground">{line.value}</span>
                        {line.qualifier ? (
                          <span className="text-muted-foreground">
                            ({line.qualifier})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {isOwner ? (
        <CatalogOwnerCardControls
          locale={locale}
          catalogItemId={page.catalog.catalogItemId}
          canonicalName={page.catalog.canonicalName}
          indexableOverride={page.card.indexableOverride}
          names={ownerNames}
          audit={ownerAudit}
        />
      ) : null}

      <PublicVarietySourceCredits
        locale={locale}
        credits={page.sourceCredits}
        contentUpdatedAt={page.catalog.contentUpdatedAt}
      />
    </main>
  );
}

type OrganismCopy = ReturnType<typeof getPublicSurfaceCopy>["organism"];

function hostClassLabel(copy: OrganismCopy, hostClass: string) {
  return (copy.hostClass as Record<string, string>)[hostClass] ?? hostClass;
}

function assertionLabel(copy: OrganismCopy, line: PublicOrganismAssertionLine) {
  if (line.kind === "name") {
    return (copy.nameType as Record<string, string>)[line.label] ?? line.label;
  }
  if (line.kind === "fact") {
    return (copy.predicate as Record<string, string>)[line.label] ?? line.label;
  }
  return `${copy.sections.identifier} ${line.label}`;
}

function getCatalogEvidenceCopy(
  locale: InterfaceLocale,
  catalogKind: CatalogKind,
) {
  const publicCopy = getPublicSurfaceCopy(locale);
  if (catalogKind === "plant_variety") {
    return {
      title: publicCopy.variety.title,
      metadataSuffix: publicCopy.variety.metadataSuffix,
      logThisIdentity: publicCopy.variety.logThisVariety,
      backToCatalog: CATALOG_EVIDENCE_COPY[locale].backToCatalog,
    };
  }

  return {
    ...CATALOG_EVIDENCE_COPY[locale][catalogKind],
    backToCatalog: CATALOG_EVIDENCE_COPY[locale].backToCatalog,
  };
}

const CATALOG_EVIDENCE_COPY = {
  uk: {
    backToCatalog: "Усі живі об'єкти",
    species: {
      title: "Публічний вид",
      metadataSuffix: "вид",
      logThisIdentity: "Записати цей вид",
    },
    breed: {
      title: "Публічна порода або лінія",
      metadataSuffix: "порода або лінія",
      logThisIdentity: "Записати цю породу або лінію",
    },
  },
  bg: {
    backToCatalog: "Всички живи обекти",
    species: {
      title: "Публичен вид",
      metadataSuffix: "вид",
      logThisIdentity: "Запишете този вид",
    },
    breed: {
      title: "Публична порода или линия",
      metadataSuffix: "порода или линия",
      logThisIdentity: "Запишете тази порода или линия",
    },
  },
  ru: {
    backToCatalog: "Все живые объекты",
    species: {
      title: "Публичный вид",
      metadataSuffix: "вид",
      logThisIdentity: "Записать этот вид",
    },
    breed: {
      title: "Публичная порода или линия",
      metadataSuffix: "порода или линия",
      logThisIdentity: "Записать эту породу или линию",
    },
  },
} as const;

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
