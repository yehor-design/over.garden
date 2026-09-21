import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { GlobeIcon as Globe2 } from "@/components/icons/Globe";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import NextLink from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import {
  articleSectionId,
  PublicArticle,
} from "@/components/public/public-article";
import {
  PublicHomeFeed,
  type PublicHomeFeedState,
} from "@/components/public/public-home-feed";
import {
  PublicKnowledgeEvidenceList,
  type PublicKnowledgeEvidenceState,
} from "@/components/public/public-knowledge-evidence";
import {
  getPublicKnowledgeCopy,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import {
  type AnswerPageContent,
  type BlogPostContent,
  type GuideContent,
  type MarketLandingContent,
  type PublicContentLink,
} from "@/server/public-seo-content";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
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
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";

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
        variant="quiet"
        className="inline-flex min-h-11 w-fit items-center rounded-lg border border-border px-3 text-body-sm"
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
  state,
  failure = null,
  jsonLd,
}: {
  locale: PublicLocale;
  content: LocalizedHomeContent;
  feed: PublicFeedPage;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  state: PublicHomeFeedState;
  failure?: WorkspaceFailureDescription | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <>
      <PublicSurfaceJsonLd value={jsonLd} />
      <PublicHomeFeed
        locale={locale}
        copy={content.feed}
        feed={feed}
        request={request}
        topics={topics}
        state={state}
        failure={failure}
      />
    </>
  );
}

export function LocalizedBlogIndexPage({
  locale,
  content,
  posts,
  jsonLd,
}: {
  locale: PublicLocale;
  content: LocalizedBlogIndexContent;
  posts: BlogPostContent[];
  availableLocales: readonly PublicLocale[];
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <main
      lang={locale}
      data-public-blog-index="true"
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <PublicSurfaceJsonLd value={jsonLd} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <BookOpen className="size-4" aria-hidden="true" />
            {content.eyebrow}
          </span>
        }
        title={content.heading}
        description={content.intro}
      />

      {/* One hub shape: a list of things is a list, and a row carries the
          date it was published beside the sentence it is about
          (DESIGN.md §4.1). */}
      <ul className="grid list-none">
        {posts.map((post) => (
          <ListRow
            key={post.slug}
            href={localizedPath(locale, post.path)}
            title={post.title}
            description={post.excerpt}
            meta={
              <time dateTime={new Date(post.publishedDate).toISOString()}>
                {formatDate(post.publishedDate, locale)}
              </time>
            }
          />
        ))}
      </ul>

      <Section
        id="blog-start"
        className="border-t border-border pt-6"
        level={2}
        title={content.startTitle}
        description={content.startBody}
      >
        <NextLink
          href="/garden"
          className={buttonVariants({ className: "w-fit" })}
        >
          <Sprout aria-hidden="true" />
          {content.workspaceCta}
        </NextLink>
      </Section>
    </main>
  );
}

export function LocalizedBlogPostPage({
  locale,
  post,
  chrome,
  jsonLd,
}: {
  locale: PublicLocale;
  post: BlogPostContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-public-blog-post": "true" }}
      backHref={localizedPath(locale, "/blog")}
      backLabel={chrome.fieldNotesBack}
      eyebrow={formatDate(post.publishedDate, locale)}
      title={post.title}
      description={post.description}
      contentsLabel={chrome.relatedPathsTitle}
      sections={post.sections.map((section, index) => ({
        id: articleSectionId("blog", section.heading, index),
        heading: section.heading,
        body: section.body,
      }))}
      jsonLd={jsonLd}
    >
      <RelatedLinks
        locale={locale}
        title={chrome.relatedPathsTitle}
        links={post.relatedLinks}
        showWorkspaceCta={true}
        workspaceCta={chrome.privateRecordCta}
      />
    </PublicArticle>
  );
}

export function LocalizedGuidePage({
  locale,
  guide,
  chrome,
  knowledgeCopy = getPublicKnowledgeCopy(locale),
  evidence = emptyKnowledgeEvidence(locale),
  evidenceState = "empty",
  jsonLd,
}: {
  locale: PublicLocale;
  guide: GuideContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-trust-state": "editorial" }}
      backHref={localizedPath(locale, "/knowledge")}
      backLabel={knowledgeCopy.backToKnowledge}
      eyebrow={`${knowledgeCopy.editorialLabel} · ${chrome.guideEyebrow}`}
      title={guide.title}
      description={guide.description}
      meta={[
        { label: knowledgeCopy.bylineLabel, value: guide.editorial.author },
        { label: knowledgeCopy.sourceLabel, value: guide.editorial.source },
        {
          label: knowledgeCopy.updatedLabel,
          value: formatDate(guide.editorial.updatedDate, locale),
        },
      ]}
      cover={
        guide.media
          ? { src: guide.media.publicUrl, alt: guide.media.alt }
          : null
      }
      outcome={guide.outcome}
      contentsLabel={chrome.guideEyebrow}
      // A guide's steps are its sections, numbered: the rail lists them, a
      // reader can share one, and a screen reader hears "heading two" rather
      // than "list item" for something that is the body of the page.
      sections={guide.steps.map((step, index) => ({
        id: articleSectionId("guide", step.title, index),
        heading: step.title,
        body: step.body,
        ordinal: index + 1,
      }))}
      jsonLd={jsonLd}
    >
      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
      />
    </PublicArticle>
  );
}

export function LocalizedAnswerPage({
  locale,
  page,
  chrome,
  knowledgeCopy = getPublicKnowledgeCopy(locale),
  evidence = emptyKnowledgeEvidence(locale),
  evidenceState = "empty",
  jsonLd,
}: {
  locale: PublicLocale;
  page: AnswerPageContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-trust-state": "editorial" }}
      backHref={localizedPath(locale, "/knowledge")}
      backLabel={knowledgeCopy.backToKnowledge}
      eyebrow={`${knowledgeCopy.editorialLabel} · ${chrome.answerEyebrow}`}
      title={page.question}
      description={page.description}
      meta={[
        { label: knowledgeCopy.bylineLabel, value: page.editorial.author },
        { label: knowledgeCopy.sourceLabel, value: page.editorial.source },
        {
          label: knowledgeCopy.updatedLabel,
          value: formatDate(page.editorial.updatedDate, locale),
        },
      ]}
      contentsLabel={chrome.faqTitle}
      // The concise answer first, because that is what the page is for, then
      // the proof behind it, then the questions it raises. Three real
      // headings rather than three bordered boxes.
      sections={[
        {
          id: "answer-concise",
          heading: chrome.conciseAnswerTitle,
          body: page.conciseAnswer,
        },
        {
          id: "answer-proof",
          heading: chrome.proofDetailsTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5">
              {page.proofDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ),
        },
        {
          id: "answer-faq",
          heading: chrome.faqTitle,
          body: (
            <dl className="grid gap-4">
              {page.faqs.map((faq) => (
                <div key={faq.question} className="grid gap-1">
                  <dt className="text-h3 text-text-heading">{faq.question}</dt>
                  <dd className="text-body-sm text-text-secondary">
                    {faq.answer}
                  </dd>
                </div>
              ))}
            </dl>
          ),
        },
      ]}
      jsonLd={jsonLd}
    >
      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
      />
    </PublicArticle>
  );
}

function PublicSurfaceJsonLd({
  value,
}: {
  value: Record<string, unknown> | null | undefined;
}) {
  const serialized = serializePublicSurfaceJsonLd(value ?? null);
  if (!serialized) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
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

export function LocalizedMarketLandingPage({
  locale,
  landing,
  chrome,
  jsonLd,
}: {
  locale: PublicLocale;
  landing: MarketLandingContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  jsonLd?: Record<string, unknown> | null;
}) {
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-public-market-landing": "true" }}
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <Globe2 className="size-4" aria-hidden="true" />
          {chrome.marketEyebrow}
        </span>
      }
      title={landing.title}
      description={landing.description}
      contentsLabel={chrome.relatedPathsTitle}
      sections={[
        {
          id: "market-audience",
          heading: chrome.marketAudienceTitle,
          body: landing.localAudience,
        },
        {
          id: "market-promise",
          heading: chrome.marketPromiseTitle,
          body: landing.promise,
        },
        {
          id: "market-proof",
          heading: chrome.marketProofTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5 text-text-secondary">
              {landing.proofPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ),
        },
      ]}
      jsonLd={jsonLd}
    >
      <NextLink
        href="/garden"
        className={buttonVariants({ className: "w-fit" })}
      >
        <Sprout aria-hidden="true" />
        {chrome.privateRecordCta}
      </NextLink>
      <RelatedLinks
        locale={locale}
        title={chrome.relatedPathsTitle}
        links={landing.relatedLinks}
      />
    </PublicArticle>
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
    <Section
      id="related-paths"
      className="border-t border-border pt-6"
      level={2}
      title={title}
      headingClassName="text-h3"
    >
      <LinkGrid locale={locale} links={links} />
      {showWorkspaceCta && workspaceCta ? (
        <NextLink
          href="/garden"
          className={buttonVariants({ className: "w-fit" })}
        >
          <Sprout aria-hidden="true" />
          {workspaceCta}
        </NextLink>
      ) : null}
    </Section>
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
    <ul className="grid list-none gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href} className="min-w-0">
          <Link
            href={localizePublicHref(locale, link.href)}
            variant="quiet"
            className="grid h-full gap-2 rounded-lg border border-border p-4 text-body-sm transition-colors duration-instant ease-out hover:bg-surface-hover hover:no-underline"
          >
            <span className="flex items-center gap-2 font-medium text-text">
              {link.href === "/garden" ? (
                <Sprout className="size-4" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
              {link.label}
            </span>
            <span className="text-text-muted">{link.description}</span>
          </Link>
        </li>
      ))}
    </ul>
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
