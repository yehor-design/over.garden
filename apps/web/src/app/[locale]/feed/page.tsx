import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listFollowedFeedStories,
  type FollowedFeedStory,
  type SocialObjectReadback,
} from "@/server/social-readback-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

interface LocalizedFeedRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LocalizedFeedRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";

  return {
    title: "Followed feed | OverGarden",
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/feed"),
          languages: buildLanguageAlternates("/feed"),
        }
      : undefined,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LocalizedFollowedFeedRoute({
  params,
}: LocalizedFeedRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <FeedShell locale={localeParam}>
        <GardenAuthPanel initialMessage="Sign in to open your followed feed." />
      </FeedShell>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const stories = await listFollowedFeedStories(scope);

  return (
    <FeedShell locale={localeParam} storyCount={stories.length}>
      {stories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
          Follow a lineage object from a public lineage graph to see its public
          journal links here.
        </p>
      ) : (
        <ol className="grid gap-3">
          {stories.map((story) => (
            <FollowedFeedStoryCard key={story.key} story={story} />
          ))}
        </ol>
      )}
    </FeedShell>
  );
}

function FeedShell({
  locale,
  storyCount,
  children,
}: {
  locale: "uk" | "bg" | "ru";
  storyCount?: number;
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
            href={localizedPath(locale, "/notifications")}
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Notifications
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Followed feed
          </h1>
          {typeof storyCount === "number" ? (
            <p className="text-sm text-muted-foreground">
              {storyCount} public journal link{storyCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </header>

      {children}
    </main>
  );
}

function FollowedFeedStoryCard({ story }: { story: FollowedFeedStory }) {
  return (
    <li>
      <Link
        href={story.href}
        className="grid gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/60"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">
              Public journal entry
            </p>
            <h2 className="text-base font-semibold break-words text-foreground">
              {story.targetObject.displayName}
            </h2>
          </div>
          <time className="text-xs text-muted-foreground">
            {formatDate(story.entryDate)}
          </time>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {story.ownerMention ? (
            <span className="rounded-md border border-border px-2 py-1 font-mono">
              {story.ownerMention}
            </span>
          ) : null}
          <ObjectMeta object={story.targetObject} />
        </div>
      </Link>
    </li>
  );
}

function ObjectMeta({ object }: { object: SocialObjectReadback }) {
  const meta = [
    object.varietyText ?? "Unknown variety",
    object.catalogKind ? object.catalogKind.replaceAll("_", " ") : null,
  ].filter(Boolean);

  return (
    <>
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
    </>
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
