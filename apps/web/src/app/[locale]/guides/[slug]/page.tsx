import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedGuidePage } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getLocalizedGuide,
  getContentAvailableLocales,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import {
  authoredContentEntityIds,
  catalogEvidencePublicPath,
  guideVisibleText,
  listGuides,
  resolveAuthoredPublicSurfaceDiscovery,
  type GuideContent,
} from "@/server/public-seo-content";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedGuideRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.flatMap((locale) =>
    listGuides().map((guide) => ({
      locale,
      slug: guide.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedGuideRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_guide").decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const resolved = await resolveGuide(localeParam, slug);
  const guide = resolved.guide;

  if (!guide) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_guide").decision;

    return {
      title: `${getLocalizedRouteChrome(localeParam).guideEyebrow} | OverGarden`,
      robots: missingState.robots,
    };
  }

  return buildGuideSurface(localeParam, guide).metadata;
}

export default async function GuideRoute({ params }: LocalizedGuideRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const resolved = await resolveGuide(localeParam, slug);
  const guide = resolved.guide;

  if (!guide) notFound();

  const surface = buildGuideSurface(localeParam, guide);

  const evidenceResult = await listPublicKnowledgeEvidence(
    guide.knowledge.evidence,
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
    <LocalizedGuidePage
      locale={localeParam}
      guide={guide}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildGuideSurface(locale: PublicLocale, guide: GuideContent) {
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_guide",
    canonicalPath: localizedPath(locale, guide.path),
    equivalentLocales: getContentAvailableLocales(guide.path),
    visibleText: guideVisibleText(guide),
    distinctPublicEntityIds: authoredContentEntityIds(guide.path, [
      ...guide.relatedLinks.map((link) => link.href),
      ...guide.knowledge.evidence.topicSlugs.map((slug) => `/topics/${slug}`),
      ...guide.knowledge.evidence.catalogSlugs.map(catalogEvidencePublicPath),
    ]),
    meaningfulContentAt: `${guide.editorial.updatedDate}T00:00:00.000Z`,
    candidateState: "candidate",
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${guide.title} | OverGarden`,
    description: guide.description,
    visibleFacts: {
      type: "Article",
      name: guide.title,
      description: guide.description,
      dateModified: `${guide.editorial.updatedDate}T00:00:00.000Z`,
      trustQualifier: `${guide.editorial.author}; ${guide.editorial.source}`,
    },
  });
}

async function resolveGuide(locale: "uk" | "bg" | "ru", slug: string) {
  return { guide: getLocalizedGuide(locale, slug) };
}

function emptyEvidence(locale: "uk" | "bg" | "ru") {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}
