import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import { LocalizedAnswerPage } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getLocalizedAnswerPage,
  getContentAvailableLocales,
  getLocalizedGuide,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import {
  readPublicKnowledgeEvidence,
  readPublicKnowledgeTopics,
} from "@/server/public-cache";
import { resolveKnowledgeRelatedItems } from "@/server/public-knowledge-related";
import { stripKnowledgeCitations } from "@/lib/knowledge-citations";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import {
  answerVisibleText,
  authoredContentEntityIds,
  knowledgeRelatedPaths,
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
  return PUBLIC_LOCALES.flatMap((locale) =>
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

  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) => renderAnswerPage(localeParam, slug, phase),
  });
}

/**
 * An authored page is a static document (ADR-0032 D8): its words are in the
 * code, and the two things it reads — the gardeners' entries beside it, and
 * which of its related topics exist — are cached reads prerendered with the
 * page. A failed read defers to the request rather than caching a page whose
 * evidence says nothing.
 */
export async function renderAnswerPage(
  localeParam: PublicLocale,
  slug: string,
  phase: PublicRenderPhase,
) {
  await deferStaticRenderWithoutDatabase(phase);
  const resolved = await resolveAnswer(localeParam, slug);
  const page = resolved.page;

  if (!page) notFound();

  const surface = buildAnswerSurface(localeParam, page);

  const [evidenceResult, topics] = await Promise.all([
    readPublicKnowledgeEvidence(page.knowledge.evidence, localeParam).then(
      (evidence) => ({
        evidence,
        state:
          evidence.totalCount > 0 ? ("ready" as const) : ("empty" as const),
      }),
      (error: unknown) => {
        unstable_rethrow(error);
        deferStaticRenderAfterFailure(phase);
        return {
          evidence: emptyEvidence(localeParam),
          state: "error" as const,
        };
      },
    ),
    readPublicKnowledgeTopics().catch((error: unknown) => {
      unstable_rethrow(error);
      // A related list without its topics is a partial page; the request
      // renders it, and the prerender does not keep it.
      deferStaticRenderAfterFailure(phase);
      return [];
    }),
  ]);

  return (
    <LocalizedAnswerPage
      locale={localeParam}
      page={page}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales()}
      evidence={evidenceResult.evidence}
      evidenceState={evidenceResult.state}
      productHelpGuideTitle={
        getLocalizedGuide(localeParam, page.productHelp.guideSlug)?.title ??
        page.productHelp.title
      }
      related={resolveKnowledgeRelatedItems(
        localeParam,
        page.knowledge.related,
        topics,
      )}
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
    distinctPublicEntityIds: authoredContentEntityIds(
      page.path,
      knowledgeRelatedPaths(page),
    ),
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
      trustQualifier:
        getPublicKnowledgeCopy(locale).subjects[page.knowledge.subject],
      // The gardening questions the page answers, as a reader reads them:
      // the citation marks are links on the page and noise in a graph. The
      // product help is not a question the page is about.
      questions: page.faqs.map((faq) => ({
        question: faq.question,
        answer: stripKnowledgeCitations(faq.answer),
      })),
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
