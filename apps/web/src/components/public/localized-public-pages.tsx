import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Globe2,
  NotebookPen,
  ShieldCheck,
  Sprout,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/public/language-switcher";
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

export function PublicLocalizedHeader({
  locale,
  basePath,
  availableLocales,
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
      <LanguageSwitcher
        locale={locale}
        basePath={basePath}
        availableLocales={availableLocales}
      />
    </div>
  );
}

export function LocalizedHomePage({
  locale,
  content,
  availableLocales,
}: {
  locale: PublicLocale;
  content: LocalizedHomeContent;
  availableLocales: readonly PublicLocale[];
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col justify-center gap-7 border-b border-border py-10 sm:py-14">
        <PublicLocalizedHeader
          locale={locale}
          basePath="/"
          availableLocales={availableLocales}
        />
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-muted-foreground">
            {content.eyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {content.heading}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            {content.intro}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/garden" className={buttonVariants({ size: "lg" })}>
            <Sprout className="size-4" />
            {content.primaryCta}
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/garden"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {content.secondaryCta}
          </Link>
        </div>

        <dl className="grid gap-3 pt-4 sm:grid-cols-3">
          {content.featureCards.map((card, index) => (
            <div
              key={card.title}
              className="flex flex-col gap-2 border-t border-border pt-3"
            >
              <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
                {index === 0 ? <NotebookPen className="size-4" /> : null}
                {index === 1 ? <ShieldCheck className="size-4" /> : null}
                {index === 2 ? <Sprout className="size-4" /> : null}
                {card.title}
              </dt>
              <dd className="text-sm leading-6 text-muted-foreground">
                {card.body}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="grid gap-3 pb-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {content.sectionTitle}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {content.sectionBody}
        </p>
      </section>
    </main>
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
}: {
  locale: PublicLocale;
  guide: GuideContent;
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
          basePath={guide.path}
          availableLocales={availableLocales}
          backHref="/blog"
          backLabel={chrome.fieldNotesBack}
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {chrome.guideEyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {guide.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {guide.description}
          </p>
        </div>
        <p className="max-w-3xl rounded-lg border border-border p-4 text-sm leading-6 text-foreground">
          {guide.outcome}
        </p>
      </header>

      <ol className="grid gap-4">
        {guide.steps.map((step, index) => (
          <li
            key={step.title}
            className="grid gap-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-sm font-semibold">
                {index + 1}
              </span>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {step.title}
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <CheckCircle2 className="size-5" />
          {chrome.nextStepTitle}
        </h2>
        <LinkGrid locale={locale} links={guide.relatedLinks} />
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          {chrome.privateRecordCta}
        </Link>
      </section>
    </main>
  );
}

export function LocalizedAnswerPage({
  locale,
  page,
  chrome,
  availableLocales,
}: {
  locale: PublicLocale;
  page: AnswerPageContent;
  chrome: LocalizedRouteChrome;
  availableLocales: readonly PublicLocale[];
}) {
  const jsonLd = buildAnswerPageJsonLd(page, locale);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <PublicLocalizedHeader
          locale={locale}
          basePath={page.path}
          availableLocales={availableLocales}
          backHref="/blog"
          backLabel={chrome.fieldNotesBack}
        />
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <HelpCircle className="size-4" />
            {chrome.answerEyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.question}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {page.description}
          </p>
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {chrome.conciseAnswerTitle}
        </h2>
        <p className="max-w-3xl text-base leading-7 text-foreground">
          {page.conciseAnswer}
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {chrome.proofDetailsTitle}
        </h2>
        <ul className="grid gap-3">
          {page.proofDetails.map((detail) => (
            <li
              key={detail}
              className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground"
            >
              {detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <RelatedLinkGroup
          locale={locale}
          title={chrome.relatedVarietiesTitle}
          links={page.relatedVarieties}
        />
        <RelatedLinkGroup
          locale={locale}
          title={chrome.relatedTopicsTitle}
          links={page.relatedTopics}
        />
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {chrome.faqTitle}
        </h2>
        <div className="grid gap-3">
          {page.faqs.map((faq) => (
            <article
              key={faq.question}
              className="grid gap-2 rounded-lg border border-border p-4"
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
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          {chrome.recordPlantCta}
        </Link>
      </section>
    </main>
  );
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

function RelatedLinkGroup({
  locale,
  title,
  links,
}: {
  locale: PublicLocale;
  title: string;
  links: PublicContentLink[];
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <LinkGrid locale={locale} links={links} />
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
