import Link from "next/link";
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
import { buttonVariants } from "@/components/ui/button";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import type { PublicTopicAggregationPage } from "@/server/public-topic-repository";

export function PublicKnowledgeTopicPage({
  locale,
  copy,
  topic,
  evidence,
  evidenceState,
  visualCorpus = false,
  actions,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  topic: PublicTopicAggregationPage;
  evidence: PublicKnowledgeEvidence;
  evidenceState: PublicKnowledgeEvidenceState;
  visualCorpus?: boolean;
  actions?: ReactNode;
}) {
  const contextModules = topicContextModules(copy, topic, evidence);

  return (
    <main
      lang={locale}
      data-public-knowledge-topic="true"
      data-trust-state="user-evidence"
      className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-4 sm:px-6 sm:py-5"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <header className="grid gap-4 border-b border-border pb-5">
        <Link
          href={knowledgeHubPath(locale, visualCorpus)}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-fit",
          })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.backToKnowledge}
        </Link>
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
            <Tags className="size-4" aria-hidden="true" />
            {copy.publicTopicLabel}
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold text-foreground">
            {topic.topic.label}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {formatPublicKnowledgeEvidenceCount(topic.entryCount, locale, copy)}
            .{" "}
            {topic.indexState.isIndexable
              ? copy.topicIndexable
              : copy.topicNoindex}
          </p>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </header>

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

function knowledgeHubPath(locale: PublicLocale, visualCorpus: boolean) {
  const path = localizedPath(locale, "/knowledge");
  return visualCorpus
    ? `${path}?${new URLSearchParams({ __visualKnowledge: "corpus" })}`
    : path;
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
