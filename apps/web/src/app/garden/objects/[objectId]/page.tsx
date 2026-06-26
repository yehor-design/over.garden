import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession } from "@/server/auth-session";
import { getPlantObjectPage } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";

export const dynamic = "force-dynamic";

interface PlantObjectPageProps {
  params: Promise<{ objectId: string }>;
}

export default async function PlantObjectReadbackPage({
  params,
}: PlantObjectPageProps) {
  const { objectId } = await params;
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <Link href="/garden" className="text-sm text-muted-foreground">
            Garden journal
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Plant object
          </h1>
        </header>
        <GardenAuthPanel />
      </main>
    );
  }

  const page = await getPlantObjectPage(scopedToUser(userId), objectId);
  if (!page) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Back to journal
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {page.space.display_name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {page.plantObject.display_name}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              Location: {page.plantObject.location_visibility}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Variety: {page.plantObject.variety_text ?? "unknown"}
            </span>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Journal entries
          </h2>
          <p className="text-sm text-muted-foreground">
            {page.entries.length === 1
              ? "1 entry saved for this object."
              : `${page.entries.length} entries saved for this object.`}
          </p>
        </div>

        {page.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No entries for this object yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {page.entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="text-base font-semibold text-foreground">
                    {entry.title}
                  </h3>
                  <time className="text-xs text-muted-foreground">
                    {formatDate(entry.entry_date)}
                  </time>
                </div>
                <p className="mt-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {entry.body}
                </p>
                {entry.media ? (
                  <Image
                    src={entry.media.publicUrl}
                    alt={`${entry.title} photo`}
                    width={960}
                    height={540}
                    sizes="(min-width: 640px) 36rem, 100vw"
                    unoptimized
                    className="mt-4 aspect-video w-full max-w-xl rounded-md border border-border object-cover"
                  />
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {entry.entry_scope} · {entry.visibility}
                  {entry.media ? " · stripped photo derivative" : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
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
