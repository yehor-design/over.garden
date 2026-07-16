import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedAnswerPage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicKnowledgeMode } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import {
  getLocalizedAnswerPage,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { listAnswerPages } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

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
  searchParams,
}: LocalizedAnswerRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const resolved = await resolveAnswer(
    localeParam,
    slug,
    (await searchParams) ?? {},
  );
  const page = resolved.page;

  if (!page) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: `${getLocalizedRouteChrome(localeParam).answerEyebrow} | OverGarden`,
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({
    kind: resolved.visualMode ? "missing" : page.kind,
  });

  return {
    title: `${page.title} | OverGarden`,
    description: page.description,
    alternates: {
      canonical: localizedPath(localeParam, page.path),
      ...(resolved.visualMode
        ? {}
        : { languages: buildLanguageAlternates(page.path) }),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function AnswerRoute({
  params,
  searchParams,
}: LocalizedAnswerRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const resolved = await resolveAnswer(
    localeParam,
    slug,
    (await searchParams) ?? {},
  );
  const page = resolved.page;

  if (!page) notFound();

  const evidenceResult =
    resolved.visualMode === "loading" || resolved.visualMode === "error"
      ? {
          evidence: emptyEvidence(localeParam),
          state: resolved.visualMode,
        }
      : await listPublicKnowledgeEvidence(
          page.knowledge.evidence,
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
    <LocalizedAnswerPage
      locale={localeParam}
      page={page}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      visualCorpus={resolved.visualMode === "corpus"}
    />
  );
}

async function resolveAnswer(
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
      page: getLocalizedAnswerPage(locale, slug),
      publicEntryIds: null,
      visualMode: null,
    };
  }
  if (visualMode === "unavailable") {
    return { page: null, publicEntryIds: [], visualMode };
  }

  const { loadVisualFixtureKnowledgeCorpus } =
    await import("@/server/public-knowledge-visual-fixture");
  const corpus = loadVisualFixtureKnowledgeCorpus(locale);
  return {
    page: corpus.answers.find((candidate) => candidate.slug === slug) ?? null,
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
