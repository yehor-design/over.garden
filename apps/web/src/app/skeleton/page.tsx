import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/server/auth-session";
import { listMyRecentJournalEntries } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import { createSkeletonJournalEntry } from "./actions";
import { SkeletonAuthPanel } from "./skeleton-auth-panel";

export const dynamic = "force-dynamic";

export default async function SkeletonPage() {
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
          One vertical path through auth, scoped Kysely repositories, Postgres,
          queueing, and SSR readback.
        </p>
      </header>

      {!userId ? <SkeletonAuthPanel /> : null}

      {userId ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Journal write path
            </h2>
            <p className="text-sm text-muted-foreground">
              Signed in as {session.user.email}
            </p>
          </div>

          <form action={createSkeletonJournalEntry} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Entry
              <textarea
                name="body"
                required
                minLength={1}
                maxLength={2000}
                className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-base font-normal text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Помідори чері — first skeleton note"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="visibility" value="public" />
              Public test entry
            </label>
            <Button type="submit" className="self-start">
              Save entry
            </Button>
          </form>
        </section>
      ) : null}

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
