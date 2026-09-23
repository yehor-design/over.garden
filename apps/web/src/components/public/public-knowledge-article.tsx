import { Fragment } from "react";

import { DocumentLink, Link } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";
import {
  knowledgeSourceAnchor,
  splitKnowledgeCitations,
} from "@/lib/knowledge-citations";
import type { PublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type {
  AnswerProductHelp,
  PublicKnowledgeEditorialMeta,
  PublicKnowledgeSource,
  PublicKnowledgeSubject,
} from "@/server/public-seo-content";

/**
 * The parts of a guide or an answer that are about the text rather than the
 * text itself (`OVE-498`, OG-UX-033): its citations, what it rests on, the
 * help with OverGarden kept apart from the advice, and one related section.
 *
 * Each part is a section with a real heading, so it is in the article's
 * contents and in a screen reader's list of headings, and none of it sits
 * above the answer: a reader who wants only the answer reads the answer.
 */

/** A sentence with its `[n]` markers as links to the n-th source. */
export function KnowledgeCitedText({
  text,
  copy,
}: {
  text: string;
  copy: PublicKnowledgeCopy;
}) {
  return (
    <>
      {splitKnowledgeCitations(text).map((segment, index) =>
        segment.kind === "text" ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <sup key={index} className="ml-px text-caption">
            <a
              href={`#${knowledgeSourceAnchor(segment.number)}`}
              aria-label={copy.citationLabel(segment.number)}
              data-knowledge-citation={segment.number}
              className="text-link rounded-sm underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {`[${segment.number}]`}
            </a>
          </sup>
        ),
      )}
    </>
  );
}

/**
 * Who wrote the text, what it rests on, what it is not, and when it changed.
 * The sources are numbered in the order the text cites them, and each one is
 * the target of its citations.
 */
export function KnowledgeAboutSection({
  id,
  locale,
  copy,
  subject,
  editorial,
}: {
  id: string;
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  subject: PublicKnowledgeSubject;
  editorial: PublicKnowledgeEditorialMeta;
}) {
  return (
    <section
      aria-labelledby={id}
      data-knowledge-about="true"
      className="grid gap-4 border-t border-border pt-6"
    >
      <h2 id={id} className="text-h2 text-text-heading">
        {copy.aboutTitle}
      </h2>
      <dl className="grid max-w-prose gap-4 text-body text-text">
        {/* A piece with no author (news, ADR-0027 D2) has no author row,
            not an empty one. */}
        {editorial.author ? (
          <AboutRow label={copy.bylineLabel}>{editorial.author}</AboutRow>
        ) : null}
        <AboutRow label={copy.subjectLabel}>{copy.subjects[subject]}</AboutRow>
        <AboutRow label={copy.basisLabel}>{editorial.basis}</AboutRow>
        <AboutRow label={copy.sourcesLabel}>
          {editorial.sources.length > 0 ? (
            <ol
              className="grid list-decimal gap-3 pl-5"
              data-knowledge-sources="true"
            >
              {editorial.sources.map((source, index) => (
                <KnowledgeSourceItem
                  key={source.url}
                  number={index + 1}
                  source={source}
                  locale={locale}
                  copy={copy}
                />
              ))}
            </ol>
          ) : (
            copy.noSources
          )}
        </AboutRow>
        {editorial.qualifications.length > 0 ? (
          <AboutRow label={copy.qualificationsLabel}>
            <ul className="grid list-disc gap-1.5 pl-5">
              {editorial.qualifications.map((qualification) => (
                <li key={qualification}>{qualification}</li>
              ))}
            </ul>
          </AboutRow>
        ) : null}
        {/* Only advice has a specialist to be checked by; help with the
            product is checked against the product. */}
        {subject === "gardening" ? (
          <AboutRow label={copy.reviewLabel}>
            {editorial.review.state === "reviewed"
              ? copy.reviewedBy(
                  editorial.review.reviewer,
                  formatKnowledgeDate(editorial.review.reviewedDate, locale),
                )
              : copy.reviewNone}
          </AboutRow>
        ) : null}
        <AboutRow label={copy.updatedLabel}>
          <time dateTime={editorial.updatedDate}>
            {formatKnowledgeDate(editorial.updatedDate, locale)}
          </time>
        </AboutRow>
      </dl>
    </section>
  );
}

function AboutRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function KnowledgeSourceItem({
  number,
  source,
  locale,
  copy,
}: {
  number: number;
  source: PublicKnowledgeSource;
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
}) {
  const dates = [
    source.sourceDate
      ? (source.sourceDate.kind === "published"
          ? copy.sourcePublished
          : copy.sourceUpdated)(
          formatKnowledgeDate(source.sourceDate.date, locale),
        )
      : null,
    copy.sourceAccessed(formatKnowledgeDate(source.accessedDate, locale)),
  ].filter((value): value is string => Boolean(value));

  return (
    // The citation's target: `scroll-mt` keeps it clear of the sticky header
    // when a reader follows `[n]` down to it.
    <li
      id={knowledgeSourceAnchor(number)}
      className="scroll-mt-20"
      data-knowledge-source={number}
    >
      <span lang={source.language}>
        {/* Another site: a plain link the browser follows, and Back returns
            to this page at this source. */}
        <DocumentLink href={source.url} rel="external" className="font-medium">
          {source.title}
        </DocumentLink>
        {` — ${source.publisher}`}
      </span>
      <span className="block text-body-sm text-text-muted">
        {dates.join("; ")}
      </span>
    </li>
  );
}

/**
 * How to do in OverGarden what the answer suggests. It is labelled as help
 * with the product and sits after the advice, never inside it, and it ends at
 * the guide that says the rest.
 */
export function KnowledgeProductHelp({
  id,
  locale,
  copy,
  help,
  guideTitle,
}: {
  id: string;
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  help: AnswerProductHelp;
  guideTitle: string;
}) {
  return (
    <section
      aria-labelledby={id}
      data-knowledge-subject="product"
      className="grid gap-3 border-t border-border pt-6"
    >
      <p className="text-overline text-text-muted uppercase">
        {copy.subjects.product}
      </p>
      <h2 id={id} className="text-h2 text-text-heading">
        {help.title}
      </h2>
      {help.paragraphs.map((paragraph) => (
        <p key={paragraph} className="max-w-prose text-body text-text">
          {paragraph}
        </p>
      ))}
      <p className="text-body">
        <Link
          href={localizedPath(locale, `/guides/${help.guideSlug}`)}
          data-knowledge-guide-link="true"
        >
          {`${copy.formats.guide}: ${guideTitle}`}
        </Link>
      </p>
    </section>
  );
}

export interface KnowledgeRelatedItem {
  key: string;
  href: string;
  title: string;
  /** What it is, in words: "Садівництво · Відповідь", "Тема · 9 записів". */
  meta: string;
}

/**
 * The one related-content section (`OVE-498`, criterion 4): a list of what to
 * read next, each labelled with what it is. Nothing else on the page
 * recommends, and an empty list renders nothing rather than a heading over
 * nothing.
 */
export function KnowledgeRelatedSection({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: readonly KnowledgeRelatedItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby={id}
      data-knowledge-related="true"
      className="grid gap-2 border-t border-border pt-6"
    >
      <h2 id={id} className="text-h2 text-text-heading">
        {title}
      </h2>
      <ul className="grid list-none">
        {items.map((item) => (
          <ListRow
            key={item.key}
            href={item.href}
            title={item.title}
            meta={item.meta}
            data-knowledge-related-item={item.key}
          />
        ))}
      </ul>
    </section>
  );
}

export function formatKnowledgeDate(value: string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(
    { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale],
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  ).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}
