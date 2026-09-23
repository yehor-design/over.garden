import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";

import {
  CatalogAlphabetIndex,
  CatalogResultRow,
} from "@/components/public/public-catalog-browse";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { DocumentLink, Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import {
  buildPublicCatalogBrowseHref,
  catalogBrowseBasePath,
  catalogKingdomSlug,
  CATALOG_BROWSE_KINGDOMS,
  EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST,
  type CatalogBrowseKingdom,
} from "@/lib/public-catalog-browse";
import type { PublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type {
  CatalogBrowseCard,
  CatalogBrowseFacetCounts,
} from "@/server/public-catalog-browse-repository";

export type PublicCatalogDoorState = "ready" | "partial" | "loading";

/**
 * The catalogue's door (`OVE-496`, OG-UX-012).
 *
 * The unfiltered `/catalog` used to open on page one of an A–Z register of
 * 114 669 scientific names — "1001" and a run of numbered cultivars first,
 * with rank and register facets and a six-figure count above them. A
 * gardener with a tomato in their hand had nothing to hold on to. The door
 * leads with what that reader came for, in this order:
 *
 * 1. **A search**, with its scope said out loud — plants, animals, or
 *    everything — by common or scientific name. A real `GET` form to the
 *    listing, so it works before the bundle runs (ADR-0024 D3), and the
 *    listing ranks what it finds (`listCatalogBrowsePage`).
 * 2. **What gardeners here have written about**, because that is where the
 *    experience is. Only those, and said to be only those: listing an
 *    organism confers nothing (ADR-0026 D9), and no row here claims evidence
 *    it does not have.
 * 3. **Species, form and your own object**, told apart in a sentence each —
 *    a legend a reader can skip, not a tutorial they must pass.
 * 4. **The crops with registered varieties**, the register hubs.
 * 5. **The whole register**, one explicit step away: by kingdom and by first
 *    letter, each a link into the listing, which keeps every facet the
 *    register had. It is still the crawl path into every organism page.
 *
 * Every link from here into the register is a `DocumentLink`. The register
 * is the query twin of this static page, and a client navigation into it
 * could change the URL over the door itself (`public-query-twin.ts`).
 *
 * It registers no context rail. The kingdoms and the register hubs a rail
 * would carry are sections of the door itself, and the same choice offered
 * three ways at once — a scope, a rail and a section — is what the audit
 * found overwhelming on the feed (OG-UX-015).
 *
 * Every read is settled on its own: a failed one hides its section and says
 * so, and the search, which needs no read at all, is always there.
 */
export function PublicCatalogDoor({
  locale,
  copy,
  kingdomTotals,
  firstHand,
  facets,
  registerHubs,
  state,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
  kingdomTotals: Readonly<Partial<Record<CatalogBrowseKingdom, number>>>;
  firstHand: readonly CatalogBrowseCard[] | null;
  facets: CatalogBrowseFacetCounts | null;
  registerHubs: readonly { slug: string; name: string; total: number }[] | null;
  state: PublicCatalogDoorState;
  jsonLd?: Record<string, unknown> | null;
}) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const kingdoms = CATALOG_BROWSE_KINGDOMS.filter(
    (kingdom) => (kingdomTotals[kingdom] ?? 0) > 0,
  );
  const total = kingdoms.reduce(
    (sum, kingdom) => sum + (kingdomTotals[kingdom] ?? 0),
    0,
  );

  return (
    <main
      lang={locale}
      data-public-catalog-browse="true"
      data-public-catalog-state={state}
      data-catalog-view="door"
      className="flex w-full min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.doorTitle}
        description={copy.doorDescription}
      />

      <CatalogSearchForm locale={locale} copy={copy} />

      {state === "partial" ? (
        <Callout tone="info">
          <p>{copy.doorPartial}</p>
        </Callout>
      ) : null}

      {state === "loading" ? (
        <ul className="grid list-none gap-3" aria-label={copy.loadingLabel}>
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-20 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : null}

      {firstHand ? (
        <Section
          id="catalog-first-hand"
          title={copy.firstHandHeading}
          description={copy.firstHandDescription}
          className="gap-3"
        >
          {firstHand.length > 0 ? (
            <ul className="grid list-none">
              {firstHand.map((card) => (
                <CatalogResultRow
                  key={card.id}
                  card={card}
                  locale={locale}
                  copy={copy}
                />
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-text-muted">
              {copy.firstHandEmpty}
            </p>
          )}
          {facets && facets.grown > firstHand.length ? (
            <DocumentLink
              href={buildPublicCatalogBrowseHref(locale, { grown: true })}
              className="w-fit text-body-sm"
            >
              {copy.firstHandAll(facets.grown)}
            </DocumentLink>
          ) : null}
        </Section>
      ) : null}

      <Section id="catalog-legend" title={copy.legendTitle} className="gap-3">
        <dl className="grid gap-3 sm:grid-cols-3">
          {copy.legend.map((item) => (
            <div
              key={item.term}
              className="grid content-start gap-1 rounded-lg border border-border p-4"
            >
              <dt className="text-h4 text-text-heading">{item.term}</dt>
              <dd className="text-body-sm text-text-secondary">
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {registerHubs && registerHubs.length > 0 ? (
        // The register hubs (OVE-433) are the substantive pages in the
        // catalogue — an aggregation over cards that are `noindex` on their
        // own (ADR-0026 D9) — so the door links them.
        <Section
          id="catalog-registers"
          title={copy.registersHeading}
          className="gap-3"
        >
          <ul className="flex list-none flex-wrap gap-2">
            {registerHubs.map((hub) => (
              <li key={hub.slug}>
                <Link
                  href={localizedPath(
                    locale,
                    publicCatalogRegisterHubPath(hub.slug),
                  )}
                  variant="quiet"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-body-sm"
                >
                  {hub.name}
                  <span className="text-caption text-text-muted tabular-nums">
                    {hub.total.toLocaleString(locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {kingdoms.length > 0 || facets ? (
        <Section
          id="catalog-all"
          title={copy.allHeading}
          description={total > 0 ? copy.allDescription(total) : undefined}
          className="gap-4"
        >
          {kingdoms.length > 0 ? (
            <ul
              aria-label={copy.kingdomsHeading}
              className="flex list-none flex-wrap gap-2"
            >
              {kingdoms.map((kingdom) => (
                <li key={kingdom}>
                  <DocumentLink
                    href={buildPublicCatalogBrowseHref(locale, {
                      kingdoms: [kingdom],
                    })}
                    variant="quiet"
                    data-catalog-kingdom={catalogKingdomSlug(kingdom)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-body-sm"
                  >
                    {copy.kingdom[kingdom]}
                    <span className="text-caption text-text-muted tabular-nums">
                      {(kingdomTotals[kingdom] ?? 0).toLocaleString(locale)}
                    </span>
                  </DocumentLink>
                </li>
              ))}
            </ul>
          ) : null}
          {facets ? (
            <CatalogAlphabetIndex
              locale={locale}
              copy={copy}
              request={EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST}
              facets={facets}
              omitAll
              documentNavigation
            />
          ) : null}
        </Section>
      ) : null}
    </main>
  );
}

/**
 * The door's search: a scope said out loud, then the name.
 *
 * Plants first, because that is most of what gardeners here keep; animals a
 * press away; everything for a fungus or a reader who does not know. The
 * scope is the listing's own `kingdom` facet, so the results page shows the
 * same choice as a mode and can widen it. A real form with a real submit.
 */
function CatalogSearchForm({
  locale,
  copy,
}: {
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
}) {
  const scopes: { value: string; label: string }[] = [
    { value: catalogKingdomSlug("Plantae"), label: copy.kingdom.Plantae },
    { value: catalogKingdomSlug("Animalia"), label: copy.kingdom.Animalia },
    { value: "", label: copy.scopeAll },
  ];

  return (
    <form
      method="get"
      action={catalogBrowseBasePath(locale)}
      role="search"
      aria-label={copy.searchLabel}
      data-catalog-search-form="true"
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <RadioGroup
        legend={copy.scopeLegend}
        orientation="horizontal"
        className="[&>legend]:text-body-sm [&>legend]:font-medium [&>legend]:text-text"
      >
        {scopes.map((scope, index) => (
          <Radio
            key={scope.label}
            name="kingdom"
            value={scope.value}
            label={scope.label}
            defaultChecked={index === 0}
          />
        ))}
      </RadioGroup>
      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
        <Field
          label={copy.searchLabel}
          id="catalog-door-search"
          className="min-w-0 flex-1 basis-full sm:basis-auto"
        >
          <SearchInput
            name="q"
            maxLength={120}
            placeholder={copy.searchPlaceholder}
            required
          />
        </Field>
        <Button type="submit" className="shrink-0">
          <Search aria-hidden="true" />
          {copy.searchSubmit}
        </Button>
      </div>
    </form>
  );
}
