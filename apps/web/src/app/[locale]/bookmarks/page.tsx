import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Bookmark, ExternalLink, Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { listEngagementBookmarks } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

interface LocalizedBookmarksRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_BOOKMARK_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};

export async function generateMetadata({
  params,
}: LocalizedBookmarksRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";

  return {
    title: "Bookmarks | OverGarden",
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/bookmarks"),
          languages: buildLanguageAlternates("/bookmarks"),
        }
      : undefined,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LocalizedBookmarksRoute({
  params,
  searchParams,
}: LocalizedBookmarksRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const query = await (searchParams ??
    Promise.resolve(EMPTY_BOOKMARK_SEARCH_PARAMS));
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <BookmarksShell locale={localeParam}>
        <GardenAuthPanel initialMessage="Sign in to open your bookmarks." />
      </BookmarksShell>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const items = await listEngagementBookmarks(scope);
  const status = firstParam(query.engagement);

  return (
    <BookmarksShell locale={localeParam} itemCount={items.length}>
      {status ? (
        <p className="text-sm text-muted-foreground">
          {status === "bookmark-removed"
            ? "Removed from bookmarks."
            : "Saved to bookmarks."}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
          Bookmark public entries, varieties, or lineage objects to read them
          later.
        </p>
      ) : (
        <ol className="grid gap-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="grid gap-4 rounded-lg border border-border p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid min-w-0 gap-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bookmark className="size-4" />
                    {targetKindLabel(item.target.kind)}
                  </p>
                  <h2 className="text-lg font-semibold break-words text-foreground">
                    {item.target.label}
                  </h2>
                  <time className="text-xs text-muted-foreground">
                    Saved {formatDate(item.addedAt)}
                  </time>
                </div>

                <form method="post" action="/api/engagement/bookmarks">
                  <input
                    type="hidden"
                    name="targetKind"
                    value={item.target.kind}
                  />
                  <input
                    type="hidden"
                    name="targetRef"
                    value={item.target.ref}
                  />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={localizedPath(localeParam, "/bookmarks")}
                  />
                  <button
                    type="submit"
                    className={buttonVariants({
                      variant: "outline",
                      className: "self-start",
                    })}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </button>
                </form>
              </div>

              <Link
                href={item.target.href}
                className={buttonVariants({
                  variant: "outline",
                  className: "self-start",
                })}
              >
                <ExternalLink className="size-4" />
                Open
              </Link>
            </li>
          ))}
        </ol>
      )}
    </BookmarksShell>
  );
}

function BookmarksShell({
  locale,
  itemCount,
  children,
}: {
  locale: "uk" | "bg" | "ru";
  itemCount?: number;
  children: ReactNode;
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/garden"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Garden
          </Link>
          <Link
            href={localizedPath(locale, "/feed")}
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Followed feed
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Bookmarks
          </h1>
          {typeof itemCount === "number" ? (
            <p className="text-sm text-muted-foreground">
              {itemCount} saved item{itemCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </header>

      {children}
    </main>
  );
}

function targetKindLabel(kind: string) {
  switch (kind) {
    case "journal_entry":
      return "Journal entry";
    case "lineage_object":
      return "Lineage object";
    case "variety":
      return "Variety";
    case "topic":
      return "Topic";
    default:
      return "Bookmark";
  }
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
