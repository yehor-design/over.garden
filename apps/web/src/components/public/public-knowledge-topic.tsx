import { ArrowLeft, Tags } from "lucide-react";
import type { ReactNode } from "react";

import {
  PublicKnowledgeEvidenceList,
  type PublicKnowledgeEvidenceState,
} from "@/components/public/public-knowledge-evidence";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import type { PublicTopicAggregationPage } from "@/server/public-topic-repository";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";

export function PublicKnowledgeTopicPage({
  locale,
  copy,
  topic,
  evidence,
  evidenceState,
  actions,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  topic: PublicTopicAggregationPage;
  evidence: PublicKnowledgeEvidence;
  evidenceState: PublicKnowledgeEvidenceState;
  actions?: ReactNode;
  jsonLd?: Record<string, unknown> | null;
}) {
  const contextModules = topicContextModules(copy, topic, evidence);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

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
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader
        breadcrumb={
          <Link
            href={knowledgeHubPath(locale)}
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
        description={formatPublicKnowledgeEvidenceCount(
          topic.entryCount,
          locale,
          copy,
        )}
        actions={actions}
      />

      {/* Whether a topic is indexable is a fact about it, and the page says
          it in a word rather than leaving a reader to infer it (DESIGN.md
          §8: colour is never the only signal, and nor is an absence). */}
      <p>
        <Badge tone={topic.indexState.isIndexable ? "success" : "neutral"}>
          {topic.indexState.isIndexable
            ? copy.topicIndexable
            : copy.topicNoindex}
        </Badge>
      </p>

      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={copy}
        evidence={evidence}
        state={evidenceState}
      />

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function knowledgeHubPath(locale: PublicLocale) {
  const path = localizedPath(locale, "/knowledge");
  return path;
}

function topicContextModules(
  copy: PublicKnowledgeCopy,
  topic: PublicTopicAggregationPage,
  evidence: PublicKnowledgeEvidence,
): SiteShellContextRailModule[] {
  return [
    {
      key: "topic-journals",
      title: copy.journalEvidenceLabel,
      items: topic.entries.slice(0, 6).map((entry) => ({
        href: entry.publicPath,
        label: entry.title,
      })),
      emptyLabel: copy.emptyEvidenceTitle,
    },
    {
      key: "topic-objects",
      title: copy.kindLabel,
      items: evidence.items.slice(0, 6).map((item) => ({
        href: item.card.object.publicPath,
        label: item.card.object.displayName,
        meta: item.card.object.identityLabel ?? undefined,
      })),
      emptyLabel: copy.emptyEvidenceTitle,
    },
  ];
}
