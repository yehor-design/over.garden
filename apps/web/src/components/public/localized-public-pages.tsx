import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Globe2,
  Sprout,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  PublicHomeFeed,
  type PublicHomeFeedState,
} from "@/components/public/public-home-feed";
import {
  PublicKnowledgeEvidenceList,
  type PublicKnowledgeEvidenceState,
} from "@/components/public/public-knowledge-evidence";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import {
  getPublicKnowledgeCopy,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import {
  buildAnswerPageJsonLd,
  type AnswerPageContent,
  type BlogPostContent,
  type GuideContent,
  type MarketLandingContent,
  type PublicContentLink,
} from "@/server/public-seo-content";
import type {
  LocalizedBlogIndexContent,
  LocalizedHomeContent,
  LocalizedRouteChrome,
} from "@/server/public-localized-content";
import type {
  PublicFeedPage,
  PublicFeedRequest,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";

export function PublicLocalizedHeader({
  locale,
  backHref = "/",
  backLabel = "OverGarden",
}: {
  locale: PublicLocale;
  basePath: string;
  availableLocales: readonly PublicLocale[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={localizedPath(locale, backHref)}
        className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
      >
        {backLabel}
      </Link>
    </div>
  );
}

export function LocalizedHomePage({
  locale,
  content,
  feed,
  request,
  topics,
  isAuthenticated,
  state,
}: {
  locale: PublicLocale;
  content: LocalizedHomeContent;
  feed: PublicFeedPage;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  isAuthenticated: boolean;
  state: PublicHomeFeedState;
}) {
  return (
    <PublicHomeFeed
      locale={locale}
      copy={content.feed}
      feed={feed}
      request={request}
      topics={topics}
      isAuthenticated={isAuthenticated}
      state={state}
    />
  );
}

export function LocalizedBlogIndexPage({
  locale,
  content,
  posts,
  availableLocales,
}: {
  locale: PublicLocale;
  content: LocalizedBlogIndexContent;
  posts: BlogPostContent[];
  availableLocales: readonly PublicLocale[];
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath="/blog"
          availableLocales={availableLocales}
        />
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BookOpen className="size-4" />
            {content.eyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {content.heading}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {content.intro}
          </p>
        </div>
      </header>

      <section className="grid gap-4">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="grid gap-4 rounded-lg border border-border p-4"
          >
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {formatDate(post.publishedDate, locale)}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {post.title}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {post.excerpt}
              </p>
            </div>
            <Link
              href={localizedPath(locale, post.path)}
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              {content.readNoteCta}
              <ArrowRight className="size-4" />
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-3 border-t border-border pt-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {content.startTitle}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {content.startBody}
        </p>
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          {content.workspaceCta}
        </Link>
      </section>
    </main>
  );
}

export function LocalizedBlogPostPage({
  locale,
  post,
  chrome,
  availableLocales,
}: {
  locale: PublicLocale;
  post: BlogPostContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath={post.path}
          availableLocales={availableLocales}
          backHref="/blog"
          backLabel={chrome.fieldNotesBack}
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {formatDate(post.publishedDate, locale)}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {post.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {post.description}
          </p>
        </div>
      </header>

      <article className="grid gap-7">
        {post.sections.map((section) => (
          <section key={section.heading} className="grid gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {section.heading}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </article>

      <RelatedLinks
        locale={locale}
        title={chrome.relatedPathsTitle}
        links={post.relatedLinks}
        showWorkspaceCta={true}
        workspaceCta={chrome.privateRecordCta}
      />
    </main>
  );
}

export function LocalizedGuidePage({
  locale,
  guide,
  chrome,
  availableLocales,
  knowledgeCopy = getPublicKnowledgeCopy(locale),
  evidence = emptyKnowledgeEvidence(locale),
  evidenceState = "empty",
  visualCorpus = false,
}: {
  locale: PublicLocale;
  guide: GuideContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  visualCorpus?: boolean;
}) {
  const contextModules = knowledgeDetailContextModules(knowledgeCopy, evidence);

  return (
    <main
      lang={locale}
      data-trust-state="editorial"
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <SiteShellContextRailRegistration modules={contextModules} />
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath={knowledgeDetailPath(guide.path, visualCorpus)}
          availableLocales={availableLocales}
          backHref={knowledgeDetailPath("/knowledge", visualCorpus)}
          backLabel={knowledgeCopy.backToKnowledge}
        />
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {knowledgeCopy.editorialLabel} · {chrome.guideEyebrow}
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold text-foreground">
            {guide.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {guide.description}
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-y border-border py-3 text-xs text-muted-foreground sm:grid-cols-3">
          <EditorialMeta
            label={knowledgeCopy.bylineLabel}
            value={guide.editorial.author}
          />
          <EditorialMeta
            label={knowledgeCopy.sourceLabel}
            value={guide.editorial.source}
          />
          <EditorialMeta
            label={knowledgeCopy.updatedLabel}
            value={formatDate(guide.editorial.updatedDate, locale)}
          />
        </dl>
        {guide.media ? (
          <figure className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-md border border-border bg-muted">
            <Image
              src={guide.media.publicUrl}
              alt={guide.media.alt}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              priority
              loading="eager"
              unoptimized
            />
          </figure>
        ) : null}
        <div className="flex max-w-3xl items-start gap-3 border-l-2 border-primary pl-4 text-sm leading-6 text-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{guide.outcome}</p>
        </div>
      </header>

      <ol className="grid border-x border-b border-border">
        {guide.steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row"
          >
            <span className="flex size-8 items-center justify-center rounded-md border border-border text-sm font-semibold">
              {index + 1}
            </span>
            <div className="grid min-w-0 gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                {step.title}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
      />
      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

export function LocalizedAnswerPage({
  locale,
  page,
  chrome,
  availableLocales,
  knowledgeCopy = getPublicKnowledgeCopy(locale),
  evidence = emptyKnowledgeEvidence(locale),
  evidenceState = "empty",
  visualCorpus = false,
}: {
  locale: PublicLocale;
  page: AnswerPageContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  visualCorpus?: boolean;
}) {
  const jsonLd = buildAnswerPageJsonLd(page, locale);
  const contextModules = knowledgeDetailContextModules(knowledgeCopy, evidence);

  return (
    <main
      lang={locale}
      data-trust-state="editorial"
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <SiteShellContextRailRegistration modules={contextModules} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath={knowledgeDetailPath(page.path, visualCorpus)}
          availableLocales={availableLocales}
          backHref={knowledgeDetailPath("/knowledge", visualCorpus)}
          backLabel={knowledgeCopy.backToKnowledge}
        />
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
            <HelpCircle className="size-4" aria-hidden="true" />
            {knowledgeCopy.editorialLabel} · {chrome.answerEyebrow}
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold text-foreground">
            {page.question}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {page.description}
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-y border-border py-3 text-xs text-muted-foreground sm:grid-cols-3">
          <EditorialMeta
            label={knowledgeCopy.bylineLabel}
            value={page.editorial.author}
          />
          <EditorialMeta
            label={knowledgeCopy.sourceLabel}
            value={page.editorial.source}
          />
          <EditorialMeta
            label={knowledgeCopy.updatedLabel}
            value={formatDate(page.editorial.updatedDate, locale)}
          />
        </dl>
      </header>

      <section className="grid gap-3 border-y border-border py-5">
        <h2 className="text-xl font-semibold text-foreground">
          {chrome.conciseAnswerTitle}
        </h2>
        <p className="max-w-3xl text-base leading-7 text-foreground">
          {page.conciseAnswer}
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold text-foreground">
          {chrome.proofDetailsTitle}
        </h2>
        <ul className="grid border-x border-b border-border">
          {page.proofDetails.map((detail) => (
            <li
              key={detail}
              className="border-t border-border p-4 text-sm leading-6 text-muted-foreground"
            >
              {detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-2xl font-semibold text-foreground">
          {chrome.faqTitle}
        </h2>
        <div className="grid border-x border-b border-border">
          {page.faqs.map((faq) => (
            <article
              key={faq.question}
              className="grid gap-2 border-t border-border p-4"
            >
              <h3 className="text-base font-semibold text-foreground">
                {faq.question}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
      />
      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function EditorialMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function emptyKnowledgeEvidence(locale: PublicLocale): PublicKnowledgeEvidence {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: localizedPath(locale, "/journals"),
  };
}

function knowledgeDetailPath(path: string, visualCorpus: boolean) {
  return visualCorpus
    ? `${path}?${new URLSearchParams({ __visualKnowledge: "corpus" })}`
    : path;
}

function knowledgeDetailContextModules(
  copy: PublicKnowledgeCopy,
  evidence: PublicKnowledgeEvidence,
): SiteShellContextRailModule[] {
  const objects = new Map(
    evidence.items.map((item) => [
      item.card.object.publicPath,
      item.card.object,
    ]),
  );

  return [
    {
      key: "knowledge-detail-journals",
      title: copy.journalEvidenceLabel,
      items: evidence.items.map((item) => ({
        href: item.card.publicPath,
        label: item.card.title,
        meta: item.card.object.displayName,
      })),
      emptyLabel: copy.emptyEvidenceTitle,
    },
    {
      key: "knowledge-detail-objects",
      title: copy.kindLabel,
      items: [...objects.values()].map((object) => ({
        href: object.publicPath,
        label: object.displayName,
        meta: object.identityLabel ?? undefined,
      })),
      emptyLabel: copy.emptyEvidenceTitle,
    },
  ];
}

export function LocalizedMarketLandingPage({
  locale,
  landing,
  chrome,
  availableLocales,
}: {
  locale: PublicLocale;
  landing: MarketLandingContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath={landing.path}
          availableLocales={availableLocales}
        />
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe2 className="size-4" />
            {chrome.marketEyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {landing.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {landing.description}
          </p>
        </div>
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          {chrome.privateRecordCta}
        </Link>
      </header>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {chrome.marketAudienceTitle}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-foreground">
          {landing.localAudience}
        </p>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {chrome.marketPromiseTitle}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {landing.promise}
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {chrome.marketProofTitle}
        </h2>
        <ul className="grid gap-3">
          {landing.proofPlan.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <RelatedLinks
        locale={locale}
        title={chrome.relatedPathsTitle}
        links={landing.relatedLinks}
      />
    </main>
  );
}

function RelatedLinks({
  locale,
  title,
  links,
  showWorkspaceCta,
  workspaceCta,
}: {
  locale: PublicLocale;
  title: string;
  links: PublicContentLink[];
  showWorkspaceCta?: boolean;
  workspaceCta?: string;
}) {
  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <LinkGrid locale={locale} links={links} />
      {showWorkspaceCta && workspaceCta ? (
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          {workspaceCta}
        </Link>
      ) : null}
    </section>
  );
}

function LinkGrid({
  locale,
  links,
}: {
  locale: PublicLocale;
  links: PublicContentLink[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={localizePublicHref(locale, link.href)}
          className="grid gap-2 rounded-lg border border-border p-4 text-sm transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-2 font-medium text-foreground">
            {link.href === "/garden" ? (
              <Sprout className="size-4" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {link.label}
          </span>
          <span className="leading-6 text-muted-foreground">
            {link.description}
          </span>
        </Link>
      ))}
    </div>
  );
}

function localizePublicHref(locale: PublicLocale, href: string) {
  const localizablePrefixes = [
    "/blog",
    "/guides",
    "/answers",
    "/markets",
    "/privacy",
    "/first-publication-disclosure",
  ];

  return localizablePrefixes.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`),
  )
    ? localizedPath(locale, href)
    : href;
}

function formatDate(value: string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
