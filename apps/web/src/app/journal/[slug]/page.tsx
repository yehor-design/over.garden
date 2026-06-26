import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getPublicJournalEntryPage } from "@/server/journal-repository";

export const dynamic = "force-dynamic";

interface PublicJournalEntryRouteProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PublicJournalEntryRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicJournalEntryPage(slug);

  if (!page) {
    return {
      title: "Entry not found | OverGarden",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${page.entry.title} | OverGarden`,
    description: summarize(page.entry.body),
    alternates: {
      canonical: publicJournalEntryPath(page.entry.publicSlug),
    },
    robots: {
      index: !page.entry.publicNoindex,
      follow: !page.entry.publicNoindex,
    },
  };
}

export default async function PublicJournalEntryPage({
  params,
}: PublicJournalEntryRouteProps) {
  const { slug } = await params;
  const page = await getPublicJournalEntryPage(slug);
  if (!page) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {page.plantObject.displayName}
            {page.plantObject.varietyText
              ? ` · ${page.plantObject.varietyText}`
              : ""}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {page.entry.title}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <time className="rounded-md border border-border px-2 py-1">
              {formatDate(page.entry.entryDate)}
            </time>
            <span className="rounded-md border border-border px-2 py-1">
              {publicLocationLabel(page.plantObject.locationVisibility)}
            </span>
          </div>
        </div>
      </header>

      <article className="flex flex-col gap-5">
        {page.media ? (
          <Image
            src={page.media.publicUrl}
            alt={`${page.entry.title} photo`}
            width={960}
            height={540}
            sizes="(min-width: 768px) 42rem, 100vw"
            unoptimized
            priority
            className="aspect-video w-full rounded-md border border-border object-cover"
          />
        ) : null}

        <p className="text-base leading-7 whitespace-pre-wrap text-foreground">
          {page.entry.body}
        </p>
      </article>
    </main>
  );
}

function publicLocationLabel(locationVisibility: string) {
  return locationVisibility === "region"
    ? "Region-level location"
    : "Location hidden";
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function summarize(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 150
    ? `${singleLine.slice(0, 147).trimEnd()}...`
    : singleLine;
}
