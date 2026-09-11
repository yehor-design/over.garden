import "server-only";

import type { Metadata } from "next";

import { absolutePublicUrl } from "@/lib/garden/public-url";
import {
  buildLanguageAlternates,
  stripLocalePrefix,
  type PublicLocale,
} from "@/lib/public-localization";
import type { PublicSurfaceDiscoveryResult } from "@/server/public-surface-discovery";

export type PublicSurfaceVisibleFactType =
  | "WebPage"
  | "Article"
  | "FAQPage"
  | "BlogPosting"
  | "CollectionPage"
  | "ProfilePage"
  | "ItemPage"
  | "Taxon";

export interface PublicSurfaceVisibleFacts {
  type: PublicSurfaceVisibleFactType;
  name: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  trustQualifier?: string;
  /** Absolute URL of the page's primary image (entries: the cover). */
  image?: string;
  questions?: readonly { question: string; answer: string }[];
  itemNames?: readonly string[];
  /** `Taxon` (ADR-0026 D9): the organism's structured facts. */
  taxon?: {
    /** The permalink URL: the `@id` that survives renames and merges. */
    id: string;
    scientificName: string;
    taxonRank: string;
    parentTaxon?: { name: string; url: string };
    sameAs: readonly string[];
  };
  /** Home → species → form, as absolute URLs; two or three items. */
  breadcrumbs?: readonly { name: string; url: string }[];
}

export interface PublicSurfaceMetadataResult {
  metadata: Metadata;
  jsonLd: Record<string, unknown> | null;
}

export function buildPublicSurfaceMetadata(input: {
  discovery: PublicSurfaceDiscoveryResult;
  locale: PublicLocale;
  title: string;
  description?: string;
  contentLocale?: PublicLocale | null;
  visibleFacts: PublicSurfaceVisibleFacts;
}): PublicSurfaceMetadataResult {
  const metadata: Metadata = {
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    robots: input.discovery.decision.robots,
  };

  if (
    !input.discovery.decision.isIndexable ||
    !input.discovery.candidateInput.canonicalPath ||
    !input.discovery.candidateInput.equivalentLocales
  ) {
    return { metadata, jsonLd: null };
  }

  const canonicalPath = input.discovery.candidateInput.canonicalPath;
  const equivalentLocales = input.discovery.candidateInput.equivalentLocales;
  const basePath = stripLocalePrefix(canonicalPath).path;
  const pageUrl = absolutePublicUrl(canonicalPath);

  // Every URL that leaves this builder is fully qualified (ADR-0029 D1). A
  // relative `canonical` is legal and Google follows it, but a relative
  // `hreflang` is ignored outright and a relative `og:url` resolves nowhere,
  // so the whole language layer below was inert while these were paths.
  metadata.alternates = {
    canonical: pageUrl,
    ...(equivalentLocales.length > 1
      ? {
          languages: Object.fromEntries(
            Object.entries(
              buildLanguageAlternates(basePath, equivalentLocales),
            ).map(([hreflang, path]) => [hreflang, absolutePublicUrl(path)]),
          ),
        }
      : {}),
  };
  metadata.openGraph = {
    type: openGraphType(input.visibleFacts.type),
    siteName: "OverGarden",
    locale: openGraphLocale(input.locale),
    ...(equivalentLocales.length > 1
      ? {
          alternateLocale: equivalentLocales
            .filter((locale) => locale !== input.locale)
            .map(openGraphLocale),
        }
      : {}),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    url: pageUrl,
    ...(input.visibleFacts.image ? { images: [input.visibleFacts.image] } : {}),
  };
  metadata.twitter = {
    card: input.visibleFacts.image ? "summary_large_image" : "summary",
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.visibleFacts.image ? { images: [input.visibleFacts.image] } : {}),
  };
  const contentLocale =
    input.contentLocale === null ? null : (input.contentLocale ?? input.locale);
  const pageNode = {
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: input.visibleFacts.name,
    ...(input.visibleFacts.description
      ? { description: input.visibleFacts.description }
      : {}),
    ...(contentLocale ? { inLanguage: contentLocale } : {}),
  };
  const factNode = buildVisibleFactNode(input.visibleFacts, pageUrl);
  const breadcrumbNode = buildBreadcrumbNode(input.visibleFacts, pageUrl);
  const mainEntityRef =
    input.visibleFacts.type === "Taxon" && input.visibleFacts.taxon
      ? { mainEntity: { "@id": input.visibleFacts.taxon.id } }
      : {};

  return {
    metadata,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        { ...pageNode, ...mainEntityRef },
        ...(factNode ? [factNode] : []),
        ...(breadcrumbNode ? [breadcrumbNode] : []),
      ],
    },
  };
}

/**
 * Open Graph wants `language_TERRITORY`. The territory is the market the locale
 * serves, not the language's country of origin: `ru` here is Bulgaria's
 * Russian-speaking audience (`BULGARIA_PUBLIC_LOCALES`), never Russia.
 */
const OPEN_GRAPH_LOCALES: Record<PublicLocale, string> = {
  uk: "uk_UA",
  bg: "bg_BG",
  ru: "ru_BG",
};

function openGraphLocale(locale: PublicLocale) {
  return OPEN_GRAPH_LOCALES[locale];
}

/** The same `visibleFacts.type` that decides the JSON-LD decides `og:type`. */
function openGraphType(type: PublicSurfaceVisibleFactType) {
  if (type === "Article" || type === "BlogPosting") return "article" as const;
  if (type === "ProfilePage") return "profile" as const;
  return "website" as const;
}

function buildBreadcrumbNode(
  facts: PublicSurfaceVisibleFacts,
  pageUrl: string,
) {
  if (!facts.breadcrumbs || facts.breadcrumbs.length === 0) return null;
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: facts.breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function buildVisibleFactNode(
  facts: PublicSurfaceVisibleFacts,
  pageUrl: string,
) {
  if (facts.type === "WebPage") return null;
  if (facts.type === "Taxon") {
    if (!facts.taxon) return null;
    return {
      "@type": "Taxon",
      "@id": facts.taxon.id,
      url: pageUrl,
      name: facts.name,
      scientificName: facts.taxon.scientificName,
      taxonRank: facts.taxon.taxonRank,
      ...(facts.description ? { description: facts.description } : {}),
      ...(facts.taxon.parentTaxon
        ? {
            parentTaxon: {
              "@type": "Taxon",
              name: facts.taxon.parentTaxon.name,
              url: facts.taxon.parentTaxon.url,
            },
          }
        : {}),
      ...(facts.taxon.sameAs.length > 0 ? { sameAs: facts.taxon.sameAs } : {}),
      ...(facts.dateModified ? { dateModified: facts.dateModified } : {}),
    };
  }
  if (facts.type === "FAQPage") {
    return {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: (facts.questions ?? []).map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    };
  }
  if (facts.type === "CollectionPage") {
    return {
      "@type": "CollectionPage",
      "@id": `${pageUrl}#collection`,
      name: facts.name,
      ...(facts.itemNames
        ? {
            hasPart: facts.itemNames.map((name) => ({
              "@type": "Thing",
              name,
            })),
          }
        : {}),
      ...(facts.trustQualifier ? { about: facts.trustQualifier } : {}),
    };
  }
  if (facts.type === "ProfilePage" || facts.type === "ItemPage") {
    return {
      "@type": facts.type,
      "@id": `${pageUrl}#main-entity`,
      name: facts.name,
      ...(facts.description ? { description: facts.description } : {}),
      ...(facts.trustQualifier ? { about: facts.trustQualifier } : {}),
    };
  }
  return {
    "@type": facts.type,
    "@id": `${pageUrl}#article`,
    headline: facts.name,
    ...(facts.description ? { description: facts.description } : {}),
    ...(facts.image ? { image: facts.image } : {}),
    ...(facts.datePublished ? { datePublished: facts.datePublished } : {}),
    ...(facts.dateModified ? { dateModified: facts.dateModified } : {}),
    ...(facts.trustQualifier ? { about: facts.trustQualifier } : {}),
  };
}
