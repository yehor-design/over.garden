import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getInterfaceCopy } from "@/lib/interface-localization";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { ensureUserPublicProfile } from "@/server/public-profile-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden-auth-panel";
import { updatePublicHandleAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public handle | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

interface GardenPublicProfilePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export default async function GardenPublicProfilePage({
  searchParams,
}: GardenPublicProfilePageProps) {
  const [session, params, locale] = await Promise.all([
    getCurrentSession(),
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = getInterfaceCopy(locale);
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main
        lang={locale}
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <ProfileHeader backLabel={copy.object.backToJournal} />
        <GardenAuthPanel />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const profile = await ensureUserPublicProfile(scope);
  const publicPath = publicProfilePath(locale, profile.handle);
  const status = profileStatusMessage(firstParam(params.status));

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <ProfileHeader backLabel={copy.object.backToJournal} />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Current handle
          </p>
          <p className="font-mono text-2xl font-semibold text-foreground">
            @{profile.handle}
          </p>
          <Link
            href={publicPath}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open public profile
          </Link>
        </div>

        <form action={updatePublicHandleAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Public handle</span>
            <span className="text-muted-foreground">
              3-30 lowercase letters, numbers, or underscores. This is the only
              identity shown when another gardener mentions you.
            </span>
            <div className="flex overflow-hidden rounded-md border border-input bg-background">
              <span className="border-r border-border px-3 py-2 text-sm text-muted-foreground">
                @
              </span>
              <input
                name="handle"
                defaultValue={profile.handle}
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
                autoCapitalize="none"
                autoCorrect="off"
                className="min-w-0 flex-1 bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
          </label>

          {status ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}

          <button
            type="submit"
            className={buttonVariants({ className: "w-fit" })}
          >
            Save handle
          </button>
        </form>
      </section>
    </main>
  );
}

function ProfileHeader({ backLabel }: { backLabel: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {backLabel}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Public handle
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Your handle lets lineage and mention flows point to you without
          exposing account details, contact data, or private journal content.
        </p>
      </div>
    </header>
  );
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function profileStatusMessage(status: string | undefined) {
  switch (status) {
    case "updated":
      return "Handle saved.";
    case "unchanged":
      return "That handle is already yours.";
    case "taken":
      return "That handle is already taken.";
    case "empty":
    case "format":
      return "Use 3-30 letters, numbers, or underscores.";
    case "reserved":
      return "That handle is reserved for OverGarden routes or support.";
    case "blocked":
      return "That handle is not available.";
    default:
      return null;
  }
}
