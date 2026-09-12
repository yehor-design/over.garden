import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { PublicCatalogRegisterHub } from "@/components/public/public-catalog-register-hub";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import { getPublicCatalogRegisterCopy } from "@/lib/public-catalog-register-copy";
import {
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { readCatalogRegisterHub } from "@/server/public-cache";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import type { CatalogRegisterHub } from "@/server/public-catalog-register-repository";

interface RegisterHubRouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

/**
 * A species' registered cultivars, at `/species/{species}/register`
 * (ADR-0029 D13 item 4, OVE-433; owner-approved 2026-09-12).
 *
 * ADR-0026 D9 keeps a bare source-built card `noindex`, and it stands. What is
 * substantive is the aggregation over those cards: "621 сортів томата у
 * реєстрах", each with the registration number a seed packet quotes — a fact
 * present on no single card and published by nobody else, because nobody else
 * holds both registers in one catalog.
 *
 * `register` is a reserved word in the form namespace, so no cultivar can take
 * this address from its own species.
 */
export async function generateMetadata({
  params,
}: RegisterHubRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_species_register_hub",
      ).decision.robots,
    };
  }
  const hub = await loadHub(slug);
  if (!hub) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_species_register_hub",
      ).decision.robots,
    };
  }
  return buildRegisterHubSurface(localeParam, hub).metadata;
}

export async function renderPublicRegisterHubPage(
  locale: PublicLocale,
  slug: string,
) {
  const hub = await loadHub(slug);
  // A species nobody has registered a cultivar of has no hub, and a page
  // saying zero is an empty listing. The proxy answers the 404 for the shape;
  // this answers it for the absence (ADR-0022 D3).
  if (!hub) notFound();

  const surface = buildRegisterHubSurface(locale, hub);
  return (
    <PublicCatalogRegisterHub
      locale={locale}
      copy={getPublicCatalogRegisterCopy(locale)}
      hub={hub}
      jsonLd={surface.jsonLd}
    />
  );
}

export default async function PublicRegisterHubRoute({
  params,
}: RegisterHubRouteProps) {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) notFound();
  return renderPublicRegisterHubPage(localeParam, slug);
}

/**
 * `connection()` first, for the reason `/species` learned the hard way: without
 * it `next build` runs this query, and a preview deployment has no
 * `DATABASE_URL` at all. A failure is an absent hub, which is a 404 rather
 * than a broken build.
 */
async function loadHub(slug: string): Promise<CatalogRegisterHub | null> {
  await connection();
  const [result] = await Promise.allSettled([readCatalogRegisterHub(slug)]);
  return result.status === "fulfilled" ? result.value : null;
}

function buildRegisterHubSurface(
  locale: PublicLocale,
  hub: CatalogRegisterHub,
) {
  const copy = getPublicCatalogRegisterCopy(locale);
  const canonicalPath = localizedPath(
    locale,
    publicCatalogRegisterHubPath(hub.speciesSlug),
  );
  const discovery = resolvePublicSurfaceDiscoveryForRequest({
    consumerId: "localized_species_register_hub",
    candidateState: "candidate",
    visibleText: [
      copy.heading(hub.speciesName, hub.total),
      copy.sourceNote,
      ...hub.forms.map((form) => form.name),
    ],
    distinctPublicEntityIds: hub.forms.map((form) => form.id),
    canonicalPath,
    servedLocale: locale,
    equivalentLocales: [...PUBLIC_LOCALES],
  });

  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: copy.metadataTitle(hub.speciesName, hub.total),
    description: copy.description(hub.speciesName, hub.total),
    visibleFacts: {
      type: "CollectionPage",
      name: copy.heading(hub.speciesName, hub.total),
      description: copy.description(hub.speciesName, hub.total),
      // `hasPart` is built from the rows the page shows and nothing else: a
      // graph that claims more than the page does is the defect this whole
      // slice exists to remove.
      itemNames: hub.forms.map((form) => form.name),
    },
  });
}
