import { tryResolveVisualFixtureEnvironment } from "./environment";
import type {
  VisualFixtureKnowledgeAnswer,
  VisualFixtureKnowledgeGuide,
  VisualFixtureManifest,
} from "./manifest";

import type { PublicLocale } from "@/lib/public-localization";
import type {
  AnswerPageContent,
  GuideContent,
  PublicKnowledgeMedia,
} from "@/server/public-seo-content";

export type VisualFixturePublicKnowledgeMode =
  | "corpus"
  | "loading"
  | "error"
  | "unavailable";

type SearchParams = Record<string, string | string[] | undefined>;
type EnvLike = Record<string, string | undefined>;

export function resolveVisualFixturePublicKnowledgeMode(
  searchParams: SearchParams,
  env: EnvLike,
): VisualFixturePublicKnowledgeMode | null {
  const mode = searchParams.__visualKnowledge;
  if (
    mode !== "corpus" &&
    mode !== "loading" &&
    mode !== "error" &&
    mode !== "unavailable"
  ) {
    return null;
  }

  return tryResolveVisualFixtureEnvironment(env) ? mode : null;
}

export interface VisualFixtureKnowledgeCorpus {
  guides: GuideContent[];
  answers: AnswerPageContent[];
  publicEntryIds: string[];
  topicSlugs: string[];
}

export function buildVisualFixtureKnowledgeCorpus(
  manifest: VisualFixtureManifest,
  locale: PublicLocale,
  publicMediaUrl: (derivativeKey: string) => string,
): VisualFixtureKnowledgeCorpus {
  return {
    guides: manifest.knowledgeEvidence.guides.map((guide) =>
      adaptGuide(manifest, guide, locale, publicMediaUrl),
    ),
    answers: manifest.knowledgeEvidence.answers.map((answer) =>
      adaptAnswer(manifest, answer, locale, publicMediaUrl),
    ),
    publicEntryIds: manifest.entries.flatMap((entry) =>
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.publicGoneAt === null &&
      entry.publishedAt !== null &&
      entry.publicSlug !== null
        ? [entry.id]
        : [],
    ),
    topicSlugs: manifest.topics.map((topic) => topic.slug),
  };
}

function adaptGuide(
  manifest: VisualFixtureManifest,
  guide: VisualFixtureKnowledgeGuide,
  locale: PublicLocale,
  publicMediaUrl: (derivativeKey: string) => string,
): GuideContent {
  const translation = guide.translations[locale];
  const media = adaptMedia(manifest, guide.mediaId, publicMediaUrl);

  return {
    kind: "guide",
    slug: guide.slug,
    path: guide.path,
    title: translation.title,
    description: translation.description,
    outcome: translation.outcome,
    steps: translation.steps.map((step) => ({ ...step })),
    relatedLinks: [],
    editorial: {
      ...localizedFixtureEditorial(locale),
      updatedDate: guide.editorial.updatedDate,
      synthetic: guide.editorial.synthetic,
      authoredLocale: locale,
    },
    knowledge: {
      task: guide.task,
      objectKinds: guide.objectKinds,
      evidence: {
        topicSlugs: guide.evidence.topicSlugs,
        catalogSlugs: guide.evidence.catalogSlugs,
      },
    },
    ...(media ? { media } : {}),
  };
}

function adaptAnswer(
  manifest: VisualFixtureManifest,
  answer: VisualFixtureKnowledgeAnswer,
  locale: PublicLocale,
  publicMediaUrl: (derivativeKey: string) => string,
): AnswerPageContent {
  const translation = answer.translations[locale];
  const media = adaptMedia(manifest, answer.mediaId, publicMediaUrl);

  return {
    kind: "aeo_answer",
    slug: answer.slug,
    path: answer.path,
    question: translation.question,
    title: translation.title,
    description: translation.description,
    conciseAnswer: translation.conciseAnswer,
    proofDetails: [...translation.proofDetails],
    relatedVarieties: [],
    relatedTopics: [],
    faqs: translation.faqs.map((faq) => ({ ...faq })),
    editorial: {
      ...localizedFixtureEditorial(locale),
      updatedDate: answer.editorial.updatedDate,
      synthetic: answer.editorial.synthetic,
      authoredLocale: locale,
    },
    knowledge: {
      task: answer.task,
      objectKinds: answer.objectKinds,
      evidence: {
        topicSlugs: answer.evidence.topicSlugs,
        catalogSlugs: answer.evidence.catalogSlugs,
      },
    },
    ...(media ? { media } : {}),
  };
}

function adaptMedia(
  manifest: VisualFixtureManifest,
  mediaId: string | null,
  publicMediaUrl: (derivativeKey: string) => string,
): PublicKnowledgeMedia | null {
  if (!mediaId) return null;
  const media = manifest.media.find((item) => item.id === mediaId);
  if (!media) return null;

  return {
    publicUrl: publicMediaUrl(media.derivativeKey),
    alt: media.altText,
  };
}

function localizedFixtureEditorial(locale: PublicLocale) {
  return {
    uk: {
      author: "Тестовий корпус OverGarden",
      source:
        "Синтетичний матеріал OVE-177 для візуальної перевірки. Не є експертною порадою.",
    },
    bg: {
      author: "Тестов корпус OverGarden",
      source:
        "Синтетичен материал OVE-177 за визуална проверка. Не е експертен съвет.",
    },
    ru: {
      author: "Тестовый корпус OverGarden",
      source:
        "Синтетический материал OVE-177 для визуальной проверки. Не является экспертной рекомендацией.",
    },
  }[locale];
}
