import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import { TagIcon as Tags } from "@/components/icons/Tag";
import type { ReactNode } from "react";

import {
  KnowledgeRelatedSection,
  type KnowledgeRelatedItem,
} from "@/components/public/public-knowledge-article";
import {
  PublicKnowledgeEvidenceList,
  type PublicKnowledgeEvidenceState,
} from "@/components/public/public-knowledge-evidence";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { publicTopicPath } from "@/lib/garden/public-paths";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import type { PublicTopicAggregationPage } from "@/server/public-topic-repository";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";

/**
 * A curated topic: the gardeners' entries filed under it (`OVE-498`).
 *
 * It says how many there are and when the last one was written — facts about
 * the topic — and never whether a search engine may index it (OG-UX-032). It
 * searches its own entries, through the journals' own search narrowed to the
 * topic, so there is one search behind it and not a second one to keep true.
 * Below the entries, the answers and guides that draw on the topic are its one
 * related section; nothing on the page repeats the entries in a rail.
 */
export function PublicKnowledgeTopicPage({
  locale,
  copy,
  topic,
  evidence,
  evidenceState,
  related,
  actions,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  topic: PublicTopicAggregationPage;
  evidence: PublicKnowledgeEvidence;
  evidenceState: PublicKnowledgeEvidenceState;
  related: readonly KnowledgeRelatedItem[];
  actions?: ReactNode;
  jsonLd?: Record<string, unknown> | null;
}) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const searchId = "topic-search";
  // A count of nothing is not a fact (DESIGN.md §5.10): an empty topic says
  // so once, in its entries' own section.
  const facts =
    topic.entryCount > 0
      ? [
          formatPublicKnowledgeEvidenceCount(topic.entryCount, locale, copy),
          topic.latestPublishedAt
            ? copy.topicLatest(formatDate(topic.latestPublishedAt, locale))
            : null,
        ].filter((fact): fact is string => Boolean(fact))
      : [];

  return (
    <main
      lang={locale}
      data-public-knowledge-topic="true"
      data-trust-state="user-evidence"
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <PageHeader
        breadcrumb={
          <Link
            href={localizedPath(locale, "/knowledge")}
            variant="muted"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.backToKnowledge}
          </Link>
        }
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Tags className="size-4" aria-hidden="true" />
            {copy.publicTopicLabel}
          </span>
        }
        title={topic.topic.label}
        description={facts.length > 0 ? facts.join(" · ") : undefined}
        actions={actions}
      />

      {/* A real GET form into the journals, narrowed to this topic: it works
          before the bundle, and the search is in the address, so Back returns
          here. A document navigation, because the journals' query view is a
          twin (`public-query-twin.ts`). */}
      {topic.entryCount > 0 ? (
        <form
          method="get"
          action={localizedPath(locale, "/journals")}
          role="search"
          aria-label={copy.topicSearchLabel(topic.topic.label)}
          data-topic-search="true"
          className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
        >
          <HiddenField name="topic" value={topic.topic.slug} />
          <Field
            label={copy.topicSearchLabel(topic.topic.label)}
            id={searchId}
            className="min-w-0 flex-1 basis-full sm:basis-auto"
          >
            <SearchInput
              name="q"
              maxLength={120}
              placeholder={copy.topicSearchPlaceholder}
            />
          </Field>
          <Button type="submit" className="shrink-0">
            <Search aria-hidden="true" />
            {copy.topicSearchSubmit}
          </Button>
        </form>
      ) : null}

      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={copy}
        evidence={evidence}
        state={evidenceState}
        title={copy.topicEvidenceTitle}
        headingId="topic-evidence"
        retryHref={localizedPath(locale, publicTopicPath(topic.topic.slug))}
        showCount={false}
        explainMatches={false}
      />

      <KnowledgeRelatedSection
        id="topic-related"
        title={copy.topicRelatedTitle}
        items={related}
      />
    </main>
  );
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(
    { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale],
    { day: "numeric", month: "short", year: "numeric" },
  ).format(new Date(value));
}
