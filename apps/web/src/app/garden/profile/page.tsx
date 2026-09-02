import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";

import { SignOutControl } from "@/components/auth/sign-out-control";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { publicProfilePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getOwnerProfileWorkspace } from "@/server/owner-profile-repository";
import { scopedToUser } from "@/server/request-scope";
import { getCurrentAccountMethodProjection } from "@/server/auth/account-methods";
import { AccountMethodsPanel } from "../account-methods-panel";
import { GardenAuthPanel } from "../garden-auth-panel";
import { unblockProfileAction } from "./actions";
import { OwnerProfileEditor } from "./owner-profile-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();

  return {
    title: `${COPY[locale].title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

interface GardenPublicProfilePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

const COPY = {
  uk: {
    title: "Мій публічний профіль",
    back: "До мого саду",
    open: "Відкрити публічний профіль",
    blockedTitle: "Заблоковані профілі",
    blockedEmpty: "Заблокованих профілів немає.",
    unblock: "Розблокувати",
    blocked: "Профіль заблоковано.",
    unblocked: "Профіль розблоковано.",
  },
  bg: {
    title: "Моят публичен профил",
    back: "Към моята градина",
    open: "Отвори публичния профил",
    blockedTitle: "Блокирани профили",
    blockedEmpty: "Няма блокирани профили.",
    unblock: "Разблокирай",
    blocked: "Профилът е блокиран.",
    unblocked: "Профилът е разблокиран.",
  },
  ru: {
    title: "Мой публичный профиль",
    back: "К моему саду",
    open: "Открыть публичный профиль",
    blockedTitle: "Заблокированные профили",
    blockedEmpty: "Заблокированных профилей нет.",
    unblock: "Разблокировать",
    blocked: "Профиль заблокирован.",
    unblocked: "Профиль разблокирован.",
  },
} as const;

export default async function GardenPublicProfilePage({
  searchParams,
}: GardenPublicProfilePageProps) {
  const [session, params, locale] = await Promise.all([
    getCurrentSession(),
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = COPY[locale];
  const signOutCopy = getTrustSurfaceCopy(locale).signOut;
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main
        lang={locale}
        data-garden-profile-auth-shell="guest"
        className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        <ProfileHeader locale={locale} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  const [workspace, accountMethods] = await Promise.all([
    getOwnerProfileWorkspace(
      scopedToUser(userId, getSessionId(session)),
      locale,
    ),
    getCurrentAccountMethodProjection(),
  ]);
  const publicPath = publicProfilePath(locale, workspace.editor.handle);
  const relationshipStatus = firstParam(params.relationshipStatus);

  return (
    <main
      lang={locale}
      className="mx-auto grid w-full max-w-4xl gap-10 px-4 py-6 sm:px-6 sm:py-8"
    >
      <ProfileHeader
        locale={locale}
        publicPath={publicPath}
      />

      <OwnerProfileEditor
        workspace={workspace}
        locale={locale}
        status={firstParam(params.status) ?? null}
      />

      <section className="border-t border-border pt-7">
        <AccountMethodsPanel
          initialMessage={getLocalizedOAuthErrorMessage(locale, params.error)}
          locale={locale}
          {...accountMethods}
        />
      </section>

      <section
        id="account-security"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="grid gap-1.5">
          <h2 className="text-xl font-semibold text-foreground">
            {signOutCopy.accountSectionTitle}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {signOutCopy.accountSectionDescription}
          </p>
        </div>
        <div>
          <SignOutControl presentation="profile" />
        </div>
      </section>

      <section
        id="blocked-profiles"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold text-foreground">
            {copy.blockedTitle}
          </h2>
        </div>
        {relationshipStatus === "blocked" ||
        relationshipStatus === "unblocked" ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            {relationshipStatus === "blocked" ? copy.blocked : copy.unblocked}
          </p>
        ) : null}
        {workspace.blockedProfiles.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {workspace.blockedProfiles.map((profile) => (
              <li
                key={profile.blockId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {profile.displayName ?? `@${profile.handle}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{profile.handle}
                  </p>
                </div>
                <OwnerScopedActionForm action={unblockProfileAction}>
                  <input type="hidden" name="blockId" value={profile.blockId} />
                  <button
                    type="submit"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    {copy.unblock}
                  </button>
                </OwnerScopedActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.blockedEmpty}</p>
        )}
      </section>
    </main>
  );
}

function ProfileHeader({
  locale,
  publicPath,
}: {
  locale: InterfaceLocale;
  publicPath?: string | null;
}) {
  const copy = COPY[locale];
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/garden"
          className={buttonVariants({ variant: "outline", size: "sm" })}
          data-testid="profile-return-navigation"
        >
          <ArrowLeft aria-hidden="true" />
          {copy.back}
        </Link>
        {publicPath ? (
          <Link
            href={publicPath}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {copy.open}
            <ExternalLink aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <h1 className="text-3xl font-semibold text-foreground">{copy.title}</h1>
    </header>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
