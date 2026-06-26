import Link from "next/link";

import { getCurrentSession } from "@/server/auth-session";
import { listMyPlantObjects } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel } from "./garden-auth-panel";

export const dynamic = "force-dynamic";

export default async function GardenPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const objects = userId
    ? await listMyPlantObjects(scopedToUser(userId), 12)
    : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-sm font-medium text-muted-foreground">OverGarden</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Garden journal
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Capture one real plant record with its place, object, and first
              dated note.
            </p>
          </div>
          {session?.user?.email ? (
            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
          ) : null}
        </div>
      </header>

      {!userId ? <GardenAuthPanel /> : null}

      {userId ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="flex flex-col gap-4 rounded-lg border border-border p-4 lg:col-span-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                First plant entry
              </h2>
              <p className="text-sm text-muted-foreground">
                Save the first object-level note with a catalog match or
                Unknown.
              </p>
            </div>

            <FirstEntryComposer
              today={today}
              initialClientMutationId={crypto.randomUUID()}
            />
          </section>

          <aside className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Plant objects
            </h2>
            {objects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
                No plant objects yet. Save the first entry to create one.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {objects.map((object) => (
                  <li key={object.id}>
                    <Link
                      href={`/garden/objects/${object.id}`}
                      className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/60"
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {object.displayName}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {object.spaceDisplayName}
                        {` · ${object.varietyText ?? "Unknown"}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
