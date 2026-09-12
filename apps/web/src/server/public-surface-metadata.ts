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
  /**
   * The thing this page is *about*, by permalink (ADR-0029 D13).
   *
   * An entry about a tomato points at that organism's `/id/{uuid}`, which is
   * the `@id` the card claims for itself — so the two nodes are the same node
   * to anything that reads the graph, and a traversal from the entry reaches
   * the card. The permalink is used rather than the address because an address
   * moves and an `@id` must not.
   */
  about?: { id: string; name: string; url: string };
  /**
   * Who wrote it. For a product whose claim is first-hand experience from real
   * gardeners, nothing asserted authorship in machine-readable form until now.
   */
  author?: { id: string; name: string; url: string; image?: string };
  /**
   * The other side of `about`: things written about this one. An organism card
   * lists the entries that name it, and the traversal closes.
   *
   * Deliberately an `@id` and a URL and nothing else. A consumer needs no more
   * than that to follow the link, and the organism card's graph carries the
   * organism's bounded facts and no gardener's words — the invariant
   * `test/privacy/privacy-invariant-sweep.test.ts` has held since OVE-40. The
   * entry's own page supplies its headline.
   */
  subjectOf?: readonly { id: string; url: string }[];
  /** `ProfilePage → mainEntity → Person`, the gardener the page is of. */
  person?: { id: string; name: string; url: string; image?: string };
  /** Every photograph the page shows, in the order it shows them. */
  images?: readonly { url: string; caption?: string | null }[];
}

/**
 * The site itself, on every indexable page.
 *
 * Emitted per page rather than once on the homepage, because a crawler that
 * fetches one page has to be able to resolve `publisher` from that page alone;
 * a dangling `@id` is a reference to nothing. Both nodes are small and
 * identical everywhere, which is what lets a consumer merge them.
 */
const ORGANIZATION_ID = "#organization";
const WEBSITE_ID = "#website";

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
  const siteUrl = absolutePublicUrl("/");
  const organizationId = `${siteUrl}${ORGANIZATION_ID}`;
  const websiteId = `${siteUrl}${WEBSITE_ID}`;
  const factNode = buildVisibleFactNode(
    input.visibleFacts,
    pageUrl,
    organizationId,
  );
  const breadcrumbNode = buildBreadcrumbNode(input.visibleFacts, pageUrl);
  const authorNode = buildAuthorNode(input.visibleFacts);
  const mainEntityRef =
    input.visibleFacts.type === "Taxon" && input.visibleFacts.taxon
      ? { mainEntity: { "@id": input.visibleFacts.taxon.id } }
      : input.visibleFacts.person
        ? { mainEntity: { "@id": input.visibleFacts.person.id } }
        : {};

  return {
    metadata,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          ...pageNode,
          ...mainEntityRef,
          isPartOf: { "@id": websiteId },
          ...(breadcrumbNode
            ? { breadcrumb: { "@id": breadcrumbNode["@id"] } }
            : {}),
        },
        ...(factNode ? [factNode] : []),
        ...(authorNode ? [authorNode] : []),
        ...(breadcrumbNode ? [breadcrumbNode] : []),
        {
          "@type": "Organization",
          "@id": organizationId,
          name: "OverGarden",
          url: siteUrl,
        },
        {
          "@type": "WebSite",
          "@id": websiteId,
          name: "OverGarden",
          url: siteUrl,
          publisher: { "@id": organizationId },
        },
      ],
    },
  };
}

/**
 * The gardener, or the person a profile is of, as one node the article and the
 * profile page both reference by `@id`.
 *
 * `person` and `author` are the same shape and never both present: a profile
 * page has a person and no author, an entry has an author and no person.
 */
function buildAuthorNode(facts: PublicSurfaceVisibleFacts) {
  const person = facts.author ?? facts.person;
  if (!person) return null;
  return {
    "@type": "Person",
    "@id": person.id,
    name: person.name,
    url: person.url,
    ...(person.image ? { image: person.image } : {}),
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
  organizationId: string,
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
      // The other half of an entry's `about`: what gardeners have written
      // about this organism, by the `@id` those entries claim for themselves.
      ...(facts.subjectOf && facts.subjectOf.length > 0
        ? {
            subjectOf: facts.subjectOf.map((entry) => ({
              "@type": "Article",
              "@id": entry.id,
              url: entry.url,
            })),
          }
        : {}),
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
      ...(facts.person ? { mainEntity: { "@id": facts.person.id } } : {}),
    };
  }
  const images = facts.images ?? [];
  return {
    "@type": facts.type,
    "@id": `${pageUrl}#article`,
    headline: facts.name,
    url: pageUrl,
    mainEntityOfPage: { "@id": pageUrl },
    ...(facts.description ? { description: facts.description } : {}),
    // Every photograph the page shows, as an `ImageObject` with the caption a
    // reader sees beneath it. `facts.image` alone said the entry had one photo
    // when it had two.
    ...(images.length > 0
      ? {
          image: images.map((image) => ({
            "@type": "ImageObject",
            "@id": image.url,
            url: image.url,
            contentUrl: image.url,
            ...(image.caption ? { caption: image.caption } : {}),
          })),
        }
      : facts.image
        ? { image: facts.image }
        : {}),
    ...(facts.datePublished ? { datePublished: facts.datePublished } : {}),
    ...(facts.dateModified ? { dateModified: facts.dateModified } : {}),
    ...(facts.author ? { author: { "@id": facts.author.id } } : {}),
    publisher: { "@id": organizationId },
    // What the entry is about, by the organism's permalink — the same `@id`
    // the card claims, so the two are one node and the traversal closes. The
    // structured subject wins over `trustQualifier`, which is the free-text
    // `about` this node carried when it had nothing better; a string and a
    // node cannot both be `about`, and the node is the one worth having.
    ...(facts.about
      ? {
          about: {
            "@type": "Taxon",
            "@id": facts.about.id,
            name: facts.about.name,
            url: facts.about.url,
          },
        }
      : facts.trustQualifier
        ? { about: facts.trustQualifier }
        : {}),
  };
}
