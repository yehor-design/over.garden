import "server-only";

import type { KnowledgeRelatedItem } from "@/components/public/public-knowledge-article";
import { publicTopicPath } from "@/lib/garden/public-paths";
import {
  formatPublicKnowledgeEvidenceCount,
  getPublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { localizeTopicLabel } from "@/lib/system-topic-labels";
import {
  getLocalizedAnswerPage,
  getLocalizedGuide,
  listLocalizedAnswerPages,
  listLocalizedGuides,
} from "@/server/public-localized-content";
import type {
  AnswerPageContent,
  GuideContent,
  PublicKnowledgeRelated,
} from "@/server/public-seo-content";
import type { PublicKnowledgeTopic } from "@/server/public-topic-repository";

/**
 * The one related-content section of a guide or an answer (`OVE-498`,
 * criterion 4), resolved against what exists.
 *
 * A related topic is listed only while it is curated and holds entries: a
 * link to a topic that was never created was a 404, and one to an empty
 * topic is a page that says there is nothing there. An authored piece is
 * listed by its title in the reader's language and labelled with what it is.
 */
export function resolveKnowledgeRelatedItems(
  locale: PublicLocale,
  related: readonly PublicKnowledgeRelated[],
  topics: readonly PublicKnowledgeTopic[],
): KnowledgeRelatedItem[] {
  const copy = getPublicKnowledgeCopy(locale);
  return related.flatMap((item): KnowledgeRelatedItem[] => {
    if (item.kind === "topic") {
      const topic = topics.find((candidate) => candidate.slug === item.slug);
      if (!topic || topic.entryCount === 0) return [];
      return [
        {
          key: `topic:${topic.slug}`,
          href: localizedPath(locale, publicTopicPath(topic.slug)),
          title: localizeTopicLabel(locale, topic.slug, topic.label),
          meta: `${copy.formats.topic} · ${formatPublicKnowledgeEvidenceCount(
            topic.entryCount,
            locale,
            copy,
          )}`,
        },
      ];
    }
    const content =
      item.kind === "answer"
        ? getLocalizedAnswerPage(locale, item.slug)
        : getLocalizedGuide(locale, item.slug);
    return content ? [authoredRelatedItem(locale, content)] : [];
  });
}

/**
 * The answers and guides a topic's reader may want (`OVE-498`): every piece
 * whose gardeners' entries are drawn from the topic or that names it as
 * related, in the order the hub lists them.
 */
export function listKnowledgeForTopic(
  locale: PublicLocale,
  topicSlug: string,
): KnowledgeRelatedItem[] {
  return [...listLocalizedAnswerPages(locale), ...listLocalizedGuides(locale)]
    .filter(
      (content) =>
        content.knowledge.evidence.topicSlugs.includes(topicSlug) ||
        content.knowledge.related.some(
          (related) => related.kind === "topic" && related.slug === topicSlug,
        ),
    )
    .map((content) => authoredRelatedItem(locale, content));
}

function authoredRelatedItem(
  locale: PublicLocale,
  content: GuideContent | AnswerPageContent,
): KnowledgeRelatedItem {
  const copy = getPublicKnowledgeCopy(locale);
  const format = content.kind === "guide" ? "guide" : "answer";
  return {
    key: `${format}:${content.slug}`,
    href: localizedPath(locale, content.path),
    title: content.title,
    meta: `${copy.subjects[content.knowledge.subject]} · ${copy.formats[format]}`,
  };
}
