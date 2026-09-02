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
  | "ItemPage";

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
  metadata.alternates = {
    canonical: canonicalPath,
    ...(equivalentLocales.length > 1
      ? { languages: buildLanguageAlternates(basePath, equivalentLocales) }
      : {}),
  };
  metadata.openGraph = {
    locale: input.locale,
    url: canonicalPath,
  };

  const pageUrl = absolutePublicUrl(canonicalPath);
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

  return {
    metadata,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": factNode ? [pageNode, factNode] : [pageNode],
    },
  };
}

function buildVisibleFactNode(
  facts: PublicSurfaceVisibleFacts,
  pageUrl: string,
) {
  if (facts.type === "WebPage") return null;
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
