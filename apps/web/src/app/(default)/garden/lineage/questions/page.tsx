import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listLineageFollowReadback,
  listLineageQuestionInbox,
  type LineageFollowReadbackItem,
  type LineageQuestionInboxItem,
} from "@/server/lineage-interactions-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { LineageShell, LINEAGE_QUESTIONS_PATH } from "../lineage-shell";
import { LineageGardener, lineageObjectMeta } from "../lineage-parts";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadata.questionsTitle,
    robots: { index: false, follow: false },
  };
}

export default async function LineageQuestionsPage() {
  const [viewer, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <LineageShell locale={locale} section="questions">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={LINEAGE_QUESTIONS_PATH}
        />
      </LineageShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <LineageShell locale={locale} section="questions">
        <SignInPrompt locale={locale} next={LINEAGE_QUESTIONS_PATH} />
      </LineageShell>
    );
  }

  return (
    <LineageShell locale={locale} section="questions">
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <LineageQuestionsSection locale={locale} scope={viewer.scope} />
      </Suspense>
    </LineageShell>
  );
}

/**
 * Questions and follows settle independently: a fault in one leaves the other
 * rendering its rows rather than blanking both.
 */
async function LineageQuestionsSection({
  locale,
  scope,
}: {
  locale: InterfaceLocale;
  scope: RequestScope;
}) {
  const copy = getOwnerLineageCopy(locale);
  const [questions, follows] = await Promise.all([
    settleSection(() => listLineageQuestionInbox(scope), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "lineage-questions",
      section: "questions",
    }),
    settleSection(() => listLineageFollowReadback(scope), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "lineage-questions",
      section: "follows",
    }),
  ]);

  return (
    <>
      <section aria-labelledby="lineage-questions-list" className="grid gap-4">
        <h2
          id="lineage-questions-list"
          className="text-body-sm font-medium text-text-muted"
        >
          {questions.status === "ready"
            ? formatOwnerLineageTemplate(copy.questions.count, {
                count: questions.value.length,
              })
            : copy.questions.title}
        </h2>

        {questions.status === "error" ? (
          <WorkspaceSectionError
            locale={locale}
            failure={questions}
            title={copy.questions.title}
            retryHref={LINEAGE_QUESTIONS_PATH}
          />
        ) : questions.value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
            {copy.questions.empty}
          </p>
        ) : (
          <ol className="grid gap-4">
            {questions.value.map((question) => (
              <LineageQuestionCard
                key={question.id}
                copy={copy}
                locale={locale}
                question={question}
              />
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="lineage-followed"
        className="grid gap-4 border-t border-border pt-6"
      >
        <div className="grid gap-1">
          <h2 id="lineage-followed" className="text-h3 text-text-heading">
            {copy.questions.followedTitle}
          </h2>
          <p className="max-w-prose text-body-sm text-text-muted">
            {copy.questions.followedDescription}
          </p>
        </div>

        {follows.status === "error" ? (
          <WorkspaceSectionError
            locale={locale}
            failure={follows}
            title={copy.questions.followedTitle}
            retryHref={LINEAGE_QUESTIONS_PATH}
          />
        ) : follows.value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
            {copy.questions.followedEmpty}
          </p>
        ) : (
          <ul className="grid gap-3">
            {follows.value.map((follow) => (
              <LineageFollowRow
                key={follow.id}
                copy={copy}
                locale={locale}
                follow={follow}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * Who asked, about which of the reader's objects, through which link — and
 * the one way to answer there is. OverGarden has no private reply, and a
 * question carries no contact: the answer is an entry about the object, which
 * whoever follows it sees (`OVE-495`, criterion 7). The link opens the
 * composer on that exact object (`/garden/new?object=…`, OVE-486).
 */
function LineageQuestionCard({
  copy,
  locale,
  question,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  question: LineageQuestionInboxItem;
}) {
  const yours = question.targetObject.displayName;
  const headingId = `lineage-question-${question.id}`;

  return (
    <li className="min-w-0">
      <article
        aria-labelledby={headingId}
        data-lineage-question={question.id}
        className="grid gap-3 rounded-lg border border-border p-4"
      >
        <header className="grid gap-1">
          <h3 id={headingId} className="text-h4 break-words text-text-heading">
            {formatOwnerLineageTemplate(copy.questions.cardTitle, {
              object: yours,
            })}
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-text">
            <span className="text-text-muted">{copy.questions.asker}:</span>
            <LineageGardener identity={question.asker} locale={locale} />
            <span aria-hidden="true" className="text-text-muted">
              ·
            </span>
            <time
              dateTime={new Date(question.createdAt).toISOString()}
              className="text-caption text-text-muted"
            >
              {formatOwnerLineageDate(locale, question.createdAt)}
            </time>
          </p>
        </header>

        <blockquote className="border-l-2 border-border pl-3 text-body leading-7 break-words whitespace-pre-line text-text">
          {question.questionText}
        </blockquote>

        <div className="grid gap-0.5 text-caption break-words text-text-muted">
          {question.relation ? (
            <p>
              {formatOwnerLineageTemplate(
                question.relation.readerObjectIsSource
                  ? copy.questions.relationFromYours
                  : copy.questions.relationFromTheirs,
                { theirs: question.relation.askerObjectName, yours },
              )}
            </p>
          ) : null}
          <p>{lineageObjectMeta(question.targetObject, locale)}</p>
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <NextLink
            href={`/garden/new?${new URLSearchParams({
              object: question.targetObject.id,
            })}`}
            // Merged, as `Button` merges it: raw, the base's transparent
            // border outranks the secondary one and the link has no edge.
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "w-fit max-w-full",
            )}
          >
            <NotePencil aria-hidden="true" />
            {/* Wraps rather than truncates: an object's name is the point of
                the label, and a truncated one is a sideways scroll at 320 px
                (a flex item does not shrink below its unbroken text). */}
            <span className="min-w-0 break-words">
              {formatOwnerLineageTemplate(copy.questions.answer, {
                object: yours,
              })}
            </span>
          </NextLink>
          <p className="text-caption text-text-muted">
            {copy.questions.answerHint}
          </p>
        </div>
      </article>
    </li>
  );
}

function LineageFollowRow({
  copy,
  locale,
  follow,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  follow: LineageFollowReadbackItem;
}) {
  return (
    <li
      data-lineage-follow={follow.id}
      className="grid min-w-0 gap-1 rounded-lg border border-border p-4"
    >
      <p className="text-body font-medium break-words text-text-heading">
        {follow.targetObject.displayName}
      </p>
      <p className="text-caption break-words text-text-muted">
        {lineageObjectMeta(follow.targetObject, locale)}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-text">
        <span className="text-text-muted">{copy.questions.followedOwner}:</span>
        <LineageGardener identity={follow.owner} locale={locale} />
      </p>
      <p className="text-caption text-text-muted">
        {formatOwnerLineageTemplate(copy.questions.followedSince, {
          date: formatOwnerLineageDate(locale, follow.createdAt),
        })}
      </p>
    </li>
  );
}
