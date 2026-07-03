import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
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

export const metadata: Metadata = {
  title: "Lineage updates | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LineageUpdatesPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <LineageUpdatesHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const [questions, follows] = await Promise.all([
    listLineageQuestionInbox(scope),
    listLineageFollowReadback(scope),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <LineageUpdatesHeader
        questionCount={questions.length}
        followCount={follows.length}
      />

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Questions for you
          </h2>
          <p className="text-sm text-muted-foreground">
            Delivered only from confirmed lineage participants.
          </p>
        </div>

        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No lineage questions are waiting for you.
          </p>
        ) : (
          <ol className="grid gap-3">
            {questions.map((question) => (
              <LineageQuestionCard key={question.id} question={question} />
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Followed lineage nodes
          </h2>
          <p className="text-sm text-muted-foreground">
            Only nodes that still have an active public entry are shown here.
          </p>
        </div>

        {follows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No lineage nodes followed yet.
          </p>
        ) : (
          <ol className="grid gap-3">
            {follows.map((follow) => (
              <LineageFollowCard key={follow.id} follow={follow} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function LineageUpdatesHeader({
  questionCount,
  followCount,
}: {
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
          Back to journal
        </Link>
        <Link
          href="/garden/lineage/claims"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Lineage claims
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Lineage updates
        </h1>
        {typeof questionCount === "number" &&
        typeof followCount === "number" ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              Questions: {questionCount}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Followed: {followCount}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function LineageQuestionCard({
  question,
}: {
  question: LineageQuestionInboxItem;
}) {
  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {question.targetObject.displayName}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatDate(question.createdAt)}
        </time>
      </div>
      <p className="text-sm leading-6 text-foreground">
        {question.questionText}
      </p>
      <LineageObjectMeta object={question.targetObject} />
    </li>
  );
}

function LineageFollowCard({ follow }: { follow: LineageFollowReadbackItem }) {
  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {follow.targetObject.displayName}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatDate(follow.createdAt)}
        </time>
      </div>
      <LineageObjectMeta object={follow.targetObject} />
    </li>
  );
}

function LineageObjectMeta({
  object,
}: {
  object: LineageInteractionObjectReadback;
}) {
  const meta = [
    object.varietyText ?? "Unknown variety",
    object.catalogKind ? object.catalogKind.replaceAll("_", " ") : null,
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

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
