import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { GlobeIcon as Globe2 } from "@/components/icons/Globe";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import NextLink from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Link, linkVariants } from "@/components/ui/link";
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
  formatKnowledgeDate,
  KnowledgeAboutSection,
  KnowledgeCitedText,
  KnowledgeProductHelp,
  KnowledgeRelatedSection,
  type KnowledgeRelatedItem,
} from "@/components/public/public-knowledge-article";
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
              <>
                <time dateTime={post.publishedDate}>
                  {formatDate(post.publishedDate, locale)}
                </time>
                {` · ${post.author}`}
              </>
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

/**
 * One editorial note (`OVE-499`): what it is and who signs it before the
 * text, the text in the reading column, and one list of what to read next,
 * which is also the way into the workspace. It says nothing about search
 * engines' traffic; that was the team's plan, not the reader's.
 */
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
  const relatedId = "related-paths";
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-public-blog-post": "true" }}
      backHref={localizedPath(locale, "/blog")}
      backLabel={chrome.fieldNotesBack}
      eyebrow={chrome.noteEyebrow}
      title={post.title}
      description={post.description}
      meta={[
        { label: chrome.authorLabel, value: post.author },
        {
          label: chrome.publishedLabel,
          value: (
            <time dateTime={post.publishedDate}>
              {formatDate(post.publishedDate, locale)}
            </time>
          ),
        },
      ]}
      contentsLabel={chrome.contentsTitle}
      sections={post.sections.map((section, index) => ({
        id: articleSectionId("blog", section.heading, index),
        heading: section.heading,
        body: section.body,
      }))}
      contentsAfter={[{ id: relatedId, heading: chrome.relatedPathsTitle }]}
      jsonLd={jsonLd}
    >
      <RelatedLinks
        id={relatedId}
        locale={locale}
        title={chrome.relatedPathsTitle}
        links={post.relatedLinks}
      />
    </PublicArticle>
  );
}

/**
 * A guide or an answer, read in the order a reader needs it (`OVE-498`,
 * OG-UX-033): the text first; then what gardeners wrote beside it; for an
 * answer, the help with OverGarden kept apart from the advice; then what the
 * text rests on and what it is not; then one list of what to read next.
 *
 * The byline carries the author and the date, and points down to the rest —
 * provenance a reader can reach in one step, without a wall of it above the
 * answer.
 */
export function LocalizedGuidePage({
  locale,
  guide,
  chrome,
  knowledgeCopy = getPublicKnowledgeCopy(locale),
  evidence = emptyKnowledgeEvidence(locale),
  evidenceState = "empty",
  related = [],
  jsonLd,
}: {
  locale: PublicLocale;
  guide: GuideContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  related?: readonly KnowledgeRelatedItem[];
  jsonLd?: Record<string, unknown> | null;
}) {
  const subject = guide.knowledge.subject;
  const trailing = knowledgeTrailingHeadings(
    "guide",
    knowledgeCopy,
    guide.evidenceTitle,
    related.length > 0,
  );

  return (
    <PublicArticle
      locale={locale}
      dataset={{
        "data-trust-state": "editorial",
        "data-knowledge-subject": subject,
      }}
      backHref={localizedPath(locale, "/knowledge")}
      backLabel={knowledgeCopy.backToKnowledge}
      eyebrow={`${knowledgeCopy.subjects[subject]} · ${knowledgeCopy.formats.guide}`}
      title={guide.title}
      description={guide.description}
      meta={knowledgeByline(locale, knowledgeCopy, guide.editorial, "guide")}
      cover={
        guide.media
          ? { src: guide.media.publicUrl, alt: guide.media.alt }
          : null
      }
      outcome={guide.outcome}
      contentsLabel={chrome.contentsTitle}
      // A guide's steps are its sections, numbered: the rail lists them, a
      // reader can share one, and a screen reader hears "heading two" rather
      // than "list item" for something that is the body of the page.
      sections={guide.steps.map((step, index) => ({
        id: articleSectionId("guide", step.title, index),
        heading: step.title,
        body: step.body,
        ordinal: index + 1,
      }))}
      contentsAfter={trailing}
      jsonLd={jsonLd}
    >
      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
        title={guide.evidenceTitle}
        headingId={KNOWLEDGE_HEADING_IDS.guide.evidence}
        retryHref={localizedPath(locale, guide.path)}
      />
      <KnowledgeAboutSection
        id={KNOWLEDGE_HEADING_IDS.guide.about}
        locale={locale}
        copy={knowledgeCopy}
        subject={subject}
        editorial={guide.editorial}
      />
      <KnowledgeRelatedSection
        id={KNOWLEDGE_HEADING_IDS.guide.related}
        title={knowledgeCopy.relatedTitle}
        items={related}
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
  productHelpGuideTitle,
  related = [],
  jsonLd,
}: {
  locale: PublicLocale;
  page: AnswerPageContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
  knowledgeCopy?: PublicKnowledgeCopy;
  evidence?: PublicKnowledgeEvidence;
  evidenceState?: PublicKnowledgeEvidenceState;
  /** The guide the product help ends at, by its title in this language. */
  productHelpGuideTitle: string;
  related?: readonly KnowledgeRelatedItem[];
  jsonLd?: Record<string, unknown> | null;
}) {
  const subject = page.knowledge.subject;
  const ids = KNOWLEDGE_HEADING_IDS.answer;
  const trailing = knowledgeTrailingHeadings(
    "answer",
    knowledgeCopy,
    page.evidenceTitle,
    related.length > 0,
    page.productHelp.title,
  );

  return (
    <PublicArticle
      locale={locale}
      dataset={{
        "data-trust-state": "editorial",
        "data-knowledge-subject": subject,
      }}
      backHref={localizedPath(locale, "/knowledge")}
      backLabel={knowledgeCopy.backToKnowledge}
      eyebrow={`${knowledgeCopy.subjects[subject]} · ${knowledgeCopy.formats.answer}`}
      title={page.question}
      description={page.description}
      meta={knowledgeByline(locale, knowledgeCopy, page.editorial, "answer")}
      contentsLabel={chrome.contentsTitle}
      // The answer first, because that is what the page is for; then how to
      // tell the causes apart, what to note, and the questions it raises.
      // Every claim carries the number of the source it rests on.
      sections={[
        {
          id: "answer-concise",
          heading: chrome.conciseAnswerTitle,
          body: (
            <p>
              <KnowledgeCitedText
                text={page.conciseAnswer}
                copy={knowledgeCopy}
              />
            </p>
          ),
        },
        {
          id: "answer-causes",
          heading: chrome.causesTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5">
              {page.causes.map((cause) => (
                <li key={cause}>
                  <KnowledgeCitedText text={cause} copy={knowledgeCopy} />
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: "answer-observations",
          heading: chrome.observationsTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5">
              {page.observations.map((observation) => (
                <li key={observation}>{observation}</li>
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
                  <dd className="text-body text-text-secondary">
                    <KnowledgeCitedText
                      text={faq.answer}
                      copy={knowledgeCopy}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          ),
        },
      ]}
      contentsAfter={trailing}
      jsonLd={jsonLd}
    >
      <PublicKnowledgeEvidenceList
        locale={locale}
        copy={knowledgeCopy}
        evidence={evidence}
        state={evidenceState}
        title={page.evidenceTitle}
        note={knowledgeCopy.evidenceNote}
        headingId={ids.evidence}
        retryHref={localizedPath(locale, page.path)}
      />
      <KnowledgeProductHelp
        id={ids.productHelp}
        locale={locale}
        copy={knowledgeCopy}
        help={page.productHelp}
        guideTitle={productHelpGuideTitle}
      />
      <KnowledgeAboutSection
        id={ids.about}
        locale={locale}
        copy={knowledgeCopy}
        subject={subject}
        editorial={page.editorial}
      />
      <KnowledgeRelatedSection
        id={ids.related}
        title={knowledgeCopy.relatedTitle}
        items={related}
      />
    </PublicArticle>
  );
}

/** The ids of the headings a guide or an answer renders after its body. */
const KNOWLEDGE_HEADING_IDS = {
  guide: {
    evidence: "guide-evidence",
    about: "guide-about",
    related: "guide-related",
  },
  answer: {
    evidence: "answer-evidence",
    productHelp: "answer-product-help",
    about: "answer-about",
    related: "answer-related",
  },
} as const;

function knowledgeTrailingHeadings(
  kind: "guide" | "answer",
  copy: PublicKnowledgeCopy,
  evidenceTitle: string,
  hasRelated: boolean,
  productHelpTitle?: string,
) {
  const ids = KNOWLEDGE_HEADING_IDS[kind];
  return [
    { id: ids.evidence, heading: evidenceTitle },
    ...(kind === "answer" && productHelpTitle
      ? [
          {
            id: KNOWLEDGE_HEADING_IDS.answer.productHelp,
            heading: productHelpTitle,
          },
        ]
      : []),
    { id: ids.about, heading: copy.aboutTitle },
    ...(hasRelated ? [{ id: ids.related, heading: copy.relatedTitle }] : []),
  ];
}

/**
 * Author and date, and the way down to the rest of the provenance: "4
 * джерела й обмеження" for an answer that cites four, "Основа й обмеження"
 * for help that cites none.
 */
function knowledgeByline(
  locale: PublicLocale,
  copy: PublicKnowledgeCopy,
  editorial: GuideContent["editorial"],
  kind: "guide" | "answer",
) {
  return [
    { label: copy.bylineLabel, value: editorial.author },
    {
      label: copy.updatedLabel,
      value: (
        <time dateTime={editorial.updatedDate}>
          {formatKnowledgeDate(editorial.updatedDate, locale)}
        </time>
      ),
    },
    {
      label: copy.aboutTitle,
      value: (
        <a
          href={`#${KNOWLEDGE_HEADING_IDS[kind].about}`}
          data-knowledge-about-link="true"
          className={linkVariants({ variant: "inline" })}
        >
          {copy.aboutLink(editorial.sources.length)}
        </a>
      ),
    },
  ];
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

/**
 * A country's page (`OVE-499`): who OverGarden is for there, what a gardener
 * can do with it today, what is true of it, and where to start. Every link is
 * a page that exists; nothing is for sale and nobody is located.
 */
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
  const startId = "market-start";
  return (
    <PublicArticle
      locale={locale}
      dataset={{ "data-public-market-landing": "true" }}
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <Globe2 className="size-4" aria-hidden="true" />
          {landing.eyebrow}
        </span>
      }
      title={landing.title}
      description={landing.description}
      contentsLabel={chrome.contentsTitle}
      sections={[
        {
          id: "market-audience",
          heading: chrome.marketAudienceTitle,
          body: landing.audience,
        },
        {
          id: "market-purpose",
          heading: chrome.marketPurposeTitle,
          body: landing.purpose,
        },
        {
          id: "market-facts",
          heading: chrome.marketFactsTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5">
              {landing.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ),
        },
      ]}
      contentsAfter={[{ id: startId, heading: chrome.marketStartTitle }]}
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
        id={startId}
        locale={locale}
        title={chrome.marketStartTitle}
        links={landing.relatedLinks}
      />
    </PublicArticle>
  );
}

/** The one list of where to go next, under a heading the contents name. */
function RelatedLinks({
  id,
  locale,
  title,
  links,
}: {
  id: string;
  locale: PublicLocale;
  title: string;
  links: PublicContentLink[];
}) {
  return (
    <Section
      id={id}
      className="border-t border-border pt-6"
      level={2}
      title={title}
      headingClassName="text-h3"
    >
      <LinkGrid locale={locale} links={links} />
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
    "/journals",
    "/catalog",
    "/knowledge",
    "/topics",
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
