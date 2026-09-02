import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedAnswerPage } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getLocalizedAnswerPage,
  getContentAvailableLocales,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import {
  answerVisibleText,
  authoredContentEntityIds,
  listAnswerPages,
  resolveAuthoredPublicSurfaceDiscovery,
  type AnswerPageContent,
} from "@/server/public-seo-content";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedAnswerRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.flatMap((locale) =>
    listAnswerPages().map((page) => ({
      locale,
      slug: page.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedAnswerRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_answer").decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const resolved = await resolveAnswer(localeParam, slug);
  const page = resolved.page;

  if (!page) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_answer").decision;

    return {
      title: `${getLocalizedRouteChrome(localeParam).answerEyebrow} | OverGarden`,
      robots: missingState.robots,
    };
  }

  return buildAnswerSurface(localeParam, page).metadata;
}

export default async function AnswerRoute({
  params,
}: LocalizedAnswerRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const resolved = await resolveAnswer(localeParam, slug);
  const page = resolved.page;

  if (!page) notFound();

  const surface = buildAnswerSurface(localeParam, page);

  const evidenceResult = await listPublicKnowledgeEvidence(
    page.knowledge.evidence,
    localeParam,
  ).then(
    (evidence) => ({
      evidence,
      state: evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
    }),
    () => ({
      evidence: emptyEvidence(localeParam),
      state: "error" as const,
    }),
  );

  return (
    <LocalizedAnswerPage
      locale={localeParam}
      page={page}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildAnswerSurface(locale: PublicLocale, page: AnswerPageContent) {
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_answer",
    canonicalPath: localizedPath(locale, page.path),
    equivalentLocales: getContentAvailableLocales(page.path),
    visibleText: answerVisibleText(page),
    distinctPublicEntityIds: authoredContentEntityIds(page.path, [
      ...page.relatedVarieties.map((link) => link.href),
      ...page.relatedTopics.map((link) => link.href),
      ...page.knowledge.evidence.topicSlugs.map((slug) => `/topics/${slug}`),
      ...page.knowledge.evidence.catalogSlugs.map((slug) => `/catalog/${slug}`),
    ]),
    meaningfulContentAt: `${page.editorial.updatedDate}T00:00:00.000Z`,
    candidateState: "candidate",
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${page.title} | OverGarden`,
    description: page.description,
    visibleFacts: {
      type: "FAQPage",
      name: page.title,
      description: page.description,
      dateModified: `${page.editorial.updatedDate}T00:00:00.000Z`,
      trustQualifier: `${page.editorial.author}; ${page.editorial.source}`,
      questions: page.faqs,
    },
  });
}

async function resolveAnswer(locale: "uk" | "bg" | "ru", slug: string) {
  return { page: getLocalizedAnswerPage(locale, slug) };
}

function emptyEvidence(locale: "uk" | "bg" | "ru") {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}
