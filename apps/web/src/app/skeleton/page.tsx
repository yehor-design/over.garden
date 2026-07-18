import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  isWalkingSkeletonRequestHostAllowed,
  tryResolveWalkingSkeletonEnvironment,
} from "@/lib/walking-skeleton/environment";
import { getCurrentSession } from "@/server/auth-session";
import { listMyRecentJournalEntries } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SkeletonPage() {
  if (!tryResolveWalkingSkeletonEnvironment(process.env)) notFound();

  const requestHeaders = await headers();
  if (!isWalkingSkeletonRequestHostAllowed(requestHeaders.get("host"))) {
    notFound();
  }

  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const entries = userId
    ? await listMyRecentJournalEntries(scopedToUser(userId), 10)
    : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Walking skeleton
        </h1>
        <p className="text-muted-foreground">
          Local-only proof through canonical auth, scoped Kysely repositories,
          Postgres, queueing, and SSR readback.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">
          Canonical session boundary
        </h2>
        {userId ? (
          <p className="text-sm text-muted-foreground">
            Authenticated local session. Diagnostic reads remain scoped to the
            current user.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No authenticated session. Use the canonical{" "}
            <Link className="font-medium text-foreground underline" href="/garden">
              garden sign-in flow
            </Link>
            , then return to this local diagnostic.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">SSR readback</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {entry.body}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {entry.visibility} · {entry.created_at.toISOString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
