import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Bookmark, Sprout, Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { publicCatalogStatusLabel } from "@/lib/garden/pilot-ux-copy";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  listWishlistShelfItems,
  type WishlistShelfItem,
} from "@/server/wishlist-repository";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";
import { removeCatalogPublicSlugFromWishlistAction } from "../../wishlist/actions";

export const dynamic = "force-dynamic";

interface LocalizedWishlistRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LocalizedWishlistRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";

  return {
    title: "Wishlist | OverGarden",
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/wishlist"),
          languages: buildLanguageAlternates("/wishlist"),
        }
      : undefined,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LocalizedWishlistRoute({
  params,
}: LocalizedWishlistRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <WishlistShell locale={localeParam}>
        <GardenAuthPanel initialMessage="Sign in to open your wishlist." />
      </WishlistShell>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const items = await listWishlistShelfItems(scope);

  return (
    <WishlistShell locale={localeParam} itemCount={items.length}>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
          Save a public variety when you want to try it later. It will appear
          here without creating a garden object.
        </p>
      ) : (
        <ol className="grid gap-3">
          {items.map((item) => (
            <WishlistItemCard key={item.key} item={item} locale={localeParam} />
          ))}
        </ol>
      )}
    </WishlistShell>
  );
}

function WishlistShell({
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
            Wishlist
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

function WishlistItemCard({
  item,
  locale,
}: {
  item: WishlistShelfItem;
  locale: "uk" | "bg" | "ru";
}) {
  const publicSlug = item.catalog.publicSlug;

  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bookmark className="size-4" />
            Try later
          </p>
          <h2 className="text-lg font-semibold break-words text-foreground">
            {item.catalog.canonicalName}
          </h2>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {publicCatalogStatusLabel(item.catalog.status)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {item.catalog.catalogKind.replaceAll("_", " ")}
            </span>
            <time className="rounded-md border border-border px-2 py-1">
              Saved {formatDate(item.addedAt)}
            </time>
          </div>
        </div>

        {publicSlug ? (
          <form action={removeCatalogPublicSlugFromWishlistAction}>
            <input type="hidden" name="catalogPublicSlug" value={publicSlug} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className={buttonVariants({
                variant: "outline",
                className: "w-fit",
              })}
            >
              <Trash2 className="size-4" />
              Remove
            </button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {item.activationPath ? (
          <Link href={item.activationPath} className={buttonVariants()}>
            <Sprout className="size-4" />
            Start growing
          </Link>
        ) : null}
        {item.publicPath ? (
          <Link
            href={item.publicPath}
            className={buttonVariants({ variant: "outline" })}
          >
            Open public page
          </Link>
        ) : null}
      </div>
    </li>
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
