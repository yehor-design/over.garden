import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCatalogKindLabel,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listLineageFollowReadback,
  listLineageQuestionInbox,
  type LineageFollowReadbackItem,
  type LineageInteractionObjectReadback,
  type LineageQuestionInboxItem,
} from "@/server/lineage-interactions-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { LineageUpdatesShell, LINEAGE_QUESTIONS_PATH } from "./questions-shell";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadata.updatesTitle,
    robots: { index: false, follow: false },
  };
}

export default async function LineageUpdatesPage() {
  const [viewer, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <LineageUpdatesShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={LINEAGE_QUESTIONS_PATH}
        />
      </LineageUpdatesShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <LineageUpdatesShell locale={locale}>
        <SignInPrompt
  locale={locale}
  next={"/garden/lineage/questions"}
/>
      </LineageUpdatesShell>
    );
  }

  return (
    <LineageUpdatesShell locale={locale}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <LineageUpdatesSection locale={locale} scope={viewer.scope} />
      </Suspense>
    </LineageUpdatesShell>
  );
}

/**
 * Questions and follows settle independently: a fault in one inbox leaves the
 * other rendering its rows rather than blanking both.
 */
async function LineageUpdatesSection({
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
      {questions.status === "ready" && follows.status === "ready" ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {formatOwnerLineageTemplate(copy.updates.questionCount, {
              count: questions.value.length,
            })}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {formatOwnerLineageTemplate(copy.updates.followedCount, {
              count: follows.value.length,
            })}
          </span>
        </div>
      ) : null}

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.updates.questionsTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.updates.questionsDescription}
          </p>
        </div>

        {questions.status === "error" ? (
          <WorkspaceSectionError
            locale={locale}
            failure={questions}
            title={copy.updates.questionsTitle}
            retryHref={LINEAGE_QUESTIONS_PATH}
          />
        ) : questions.value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.updates.questionsEmpty}
          </p>
        ) : (
          <ol className="grid gap-3">
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

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.updates.followedTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.updates.followedDescription}
          </p>
        </div>

        {follows.status === "error" ? (
          <WorkspaceSectionError
            locale={locale}
            failure={follows}
            title={copy.updates.followedTitle}
            retryHref={LINEAGE_QUESTIONS_PATH}
          />
        ) : follows.value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.updates.followedEmpty}
          </p>
        ) : (
          <ol className="grid gap-3">
            {follows.value.map((follow) => (
              <LineageFollowCard
                key={follow.id}
                copy={copy}
                locale={locale}
                follow={follow}
              />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function LineageQuestionCard({
  copy,
  locale,
  question,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  question: LineageQuestionInboxItem;
}) {
  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {question.targetObject.displayName}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatOwnerLineageDate(locale, question.createdAt)}
        </time>
      </div>
      <p className="text-sm leading-6 text-foreground">
        {question.questionText}
      </p>
      <LineageObjectMeta
        copy={copy}
        locale={locale}
        object={question.targetObject}
      />
    </li>
  );
}

function LineageFollowCard({
  copy,
  locale,
  follow,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  follow: LineageFollowReadbackItem;
}) {
  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {follow.targetObject.displayName}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatOwnerLineageDate(locale, follow.createdAt)}
        </time>
      </div>
      <LineageObjectMeta
        copy={copy}
        locale={locale}
        object={follow.targetObject}
      />
    </li>
  );
}

function LineageObjectMeta({
  copy,
  locale,
  object,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  object: LineageInteractionObjectReadback;
}) {
  const meta = [
    object.varietyText ?? copy.common.unknownVariety,
    getOwnerLineageCatalogKindLabel(locale, object.catalogKind),
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
    </div>
  );
}
