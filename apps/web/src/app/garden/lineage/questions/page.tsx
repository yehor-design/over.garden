import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCatalogKindLabel,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listLineageFollowReadback,
  listLineageQuestionInbox,
  type LineageFollowReadbackItem,
  type LineageInteractionObjectReadback,
  type LineageQuestionInboxItem,
} from "@/server/lineage-interactions-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadata.updatesTitle,
    robots: { index: false, follow: false },
  };
}

export default async function LineageUpdatesPage() {
  const [session, locale] = await Promise.all([
    getCurrentSession(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getOwnerLineageCopy(locale);
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main
        lang={locale}
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <LineageUpdatesHeader copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const [questions, follows] = await Promise.all([
    listLineageQuestionInbox(scope),
    listLineageFollowReadback(scope),
  ]);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <LineageUpdatesHeader
        copy={copy}
        questionCount={questions.length}
        followCount={follows.length}
      />

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.updates.questionsTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.updates.questionsDescription}
          </p>
        </div>

        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.updates.questionsEmpty}
          </p>
        ) : (
          <ol className="grid gap-3">
            {questions.map((question) => (
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

        {follows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.updates.followedEmpty}
          </p>
        ) : (
          <ol className="grid gap-3">
            {follows.map((follow) => (
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
    </main>
  );
}

function LineageUpdatesHeader({
  copy,
  questionCount,
  followCount,
}: {
  copy: OwnerLineageCopy;
  questionCount?: number;
  followCount?: number;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.common.backToJournal}
        </Link>
        <Link
          href="/garden/lineage/claims"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.common.claims}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.updates.title}
        </h1>
        {typeof questionCount === "number" &&
        typeof followCount === "number" ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {formatOwnerLineageTemplate(copy.updates.questionCount, {
                count: questionCount,
              })}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {formatOwnerLineageTemplate(copy.updates.followedCount, {
                count: followCount,
              })}
            </span>
          </div>
        ) : null}
      </div>
    </header>
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
