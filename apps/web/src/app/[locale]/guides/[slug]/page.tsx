import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedGuidePage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicKnowledgeMode } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import {
  getLocalizedGuide,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { listGuides } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

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
  searchParams,
}: LocalizedGuideRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Guide | OverGarden",
      robots: missingState.robots,
    };
  }

  const resolved = await resolveGuide(
    localeParam,
    slug,
    (await searchParams) ?? {},
  );
  const guide = resolved.guide;

  if (!guide) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Guide | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({
    kind: resolved.visualMode ? "missing" : guide.kind,
  });

  return {
    title: `${guide.title} | OverGarden`,
    description: guide.description,
    alternates: {
      canonical: localizedPath(localeParam, guide.path),
      ...(resolved.visualMode
        ? {}
        : { languages: buildLanguageAlternates(guide.path) }),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function GuideRoute({
  params,
  searchParams,
}: LocalizedGuideRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const resolved = await resolveGuide(
    localeParam,
    slug,
    (await searchParams) ?? {},
  );
  const guide = resolved.guide;

  if (!guide) notFound();

  const evidenceResult =
    resolved.visualMode === "loading" || resolved.visualMode === "error"
      ? {
          evidence: emptyEvidence(localeParam),
          state: resolved.visualMode,
        }
      : await listPublicKnowledgeEvidence(
          guide.knowledge.evidence,
          localeParam,
          {
            restrictToEntryIds: resolved.publicEntryIds,
            visualCorpus: resolved.visualMode === "corpus",
          },
        ).then(
          (evidence) => ({
            evidence,
            state:
              evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
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
      visualCorpus={resolved.visualMode === "corpus"}
    />
  );
}

async function resolveGuide(
  locale: "uk" | "bg" | "ru",
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const visualMode = resolveVisualFixturePublicKnowledgeMode(
    searchParams,
    process.env,
  );
  if (!visualMode) {
    return {
      guide: getLocalizedGuide(locale, slug),
      publicEntryIds: null,
      visualMode: null,
    };
  }
  if (visualMode === "unavailable") {
    return { guide: null, publicEntryIds: [], visualMode };
  }

  const { loadVisualFixtureKnowledgeCorpus } =
    await import("@/server/public-knowledge-visual-fixture");
  const corpus = loadVisualFixtureKnowledgeCorpus(locale);
  return {
    guide: corpus.guides.find((candidate) => candidate.slug === slug) ?? null,
    publicEntryIds: corpus.publicEntryIds,
    visualMode,
  };
}

function emptyEvidence(locale: "uk" | "bg" | "ru") {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}
