import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { ShieldCheckIcon as ShieldCheck } from "@/components/icons/ShieldCheck";
import { TranslateIcon as Translate } from "@/components/icons/Translate";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { HiddenField } from "@/components/ui/hidden-field";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { listBlockedProfiles } from "@/server/owner-profile-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { unblockProfileAction } from "@/app/(default)/garden/profile/actions";

import {
  ACCOUNT_SETTINGS_PATH,
  AccountShell,
  getAccountPageCopy,
} from "../account-shell";
import { InterfaceLanguageSetting } from "./interface-language-setting";

const COPY = {
  uk: {
    languageTitle: "Мова інтерфейсу",
    languageDescription:
      "Мова кнопок, меню й підказок на всіх сторінках. Записи садівників лишаються мовою, якою їх написано.",
    blockedTitle: "Заблоковані профілі",
    blockedDescription:
      "Ви й ці садівники не бачите профілів і коментарів одне одного.",
    blockedEmpty: "Заблокованих профілів немає.",
    unblock: "Розблокувати",
    blocked: "Профіль заблоковано.",
    unblocked: "Профіль розблоковано.",
    dataTitle: "Ваші дані",
    privacy: "Приватність",
    privacyDescription: "Що OverGarden зберігає і хто що бачить.",
    erasure: "Видалення даних",
    erasureDescription:
      "Запит на видалення чи анонімізацію даних акаунта. Його розглядає оператор; сам запит нічого не видаляє.",
  },
  bg: {
    languageTitle: "Език на интерфейса",
    languageDescription:
      "Езикът на бутоните, менютата и подсказките на всички страници. Записите на градинарите остават на езика, на който са написани.",
    blockedTitle: "Блокирани профили",
    blockedDescription:
      "Вие и тези градинари не виждате профилите и коментарите си един на друг.",
    blockedEmpty: "Няма блокирани профили.",
    unblock: "Разблокирай",
    blocked: "Профилът е блокиран.",
    unblocked: "Профилът е разблокиран.",
    dataTitle: "Вашите данни",
    privacy: "Поверителност",
    privacyDescription: "Какво съхранява OverGarden и кой какво вижда.",
    erasure: "Изтриване на данни",
    erasureDescription:
      "Заявка за изтриване или анонимизиране на данните от акаунта. Разглежда я оператор; самата заявка не изтрива нищо.",
  },
  ru: {
    languageTitle: "Язык интерфейса",
    languageDescription:
      "Язык кнопок, меню и подсказок на всех страницах. Записи садоводов остаются на языке, на котором написаны.",
    blockedTitle: "Заблокированные профили",
    blockedDescription:
      "Вы и эти садоводы не видите профилей и комментариев друг друга.",
    blockedEmpty: "Заблокированных профилей нет.",
    unblock: "Разблокировать",
    blocked: "Профиль заблокирован.",
    unblocked: "Профиль разблокирован.",
    dataTitle: "Ваши данные",
    privacy: "Приватность",
    privacyDescription: "Что хранит OverGarden и кто что видит.",
    erasure: "Удаление данных",
    erasureDescription:
      "Запрос на удаление или анонимизацию данных аккаунта. Его рассматривает оператор; сам запрос ничего не удаляет.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getAccountPageCopy(locale).settingsTitle} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

interface AccountSettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

/**
 * The account's settings (`OVE-503`): the interface language, the profiles
 * this member has blocked, and the way to their data and its deletion.
 *
 * None of it is public, and each section answers for itself: choosing a
 * language saves a language, unblocking a profile unblocks one profile.
 */
export default async function AccountSettingsPage({
  searchParams,
}: AccountSettingsPageProps) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <AccountShell locale={locale} section="settings">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={ACCOUNT_SETTINGS_PATH}
        />
      </AccountShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <AccountShell locale={locale} section="settings">
        <SignInPrompt locale={locale} next={ACCOUNT_SETTINGS_PATH} />
      </AccountShell>
    );
  }

  const copy = COPY[locale];
  const relationshipStatus = firstParam(params.relationshipStatus);

  return (
    <AccountShell locale={locale} section="settings">
      <section
        id="interface-language"
        aria-labelledby="interface-language-title"
        className="grid gap-3"
      >
        <div className="flex items-center gap-2">
          <Translate className="size-5 text-text-muted" aria-hidden="true" />
          <h2
            id="interface-language-title"
            className="text-h2 text-text-heading"
          >
            {copy.languageTitle}
          </h2>
        </div>
        <p className="max-w-prose text-body-sm text-text-muted">
          {copy.languageDescription}
        </p>
        <InterfaceLanguageSetting locale={locale} label={copy.languageTitle} />
      </section>

      <section
        id="blocked-profiles"
        aria-labelledby="blocked-profiles-title"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-text-muted" aria-hidden="true" />
          <h2 id="blocked-profiles-title" className="text-h2 text-text-heading">
            {copy.blockedTitle}
          </h2>
        </div>
        <p className="max-w-prose text-body-sm text-text-muted">
          {copy.blockedDescription}
        </p>
        {relationshipStatus === "blocked" ||
        relationshipStatus === "unblocked" ? (
          <p
            role="status"
            className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text"
          >
            {relationshipStatus === "blocked" ? copy.blocked : copy.unblocked}
          </p>
        ) : null}
        <Suspense
          fallback={
            <WorkspaceSectionSkeleton locale={locale} rows={2} media={false} />
          }
        >
          <BlockedProfiles locale={locale} scope={viewer.scope} />
        </Suspense>
      </section>

      <section
        id="account-data"
        aria-labelledby="account-data-title"
        className="grid gap-4 border-t border-border pt-7"
      >
        <h2 id="account-data-title" className="text-h2 text-text-heading">
          {copy.dataTitle}
        </h2>
        <ul className="grid list-none divide-y divide-border border-y border-border">
          {[
            {
              href: "/privacy",
              label: copy.privacy,
              description: copy.privacyDescription,
            },
            {
              href: "/erasure",
              label: copy.erasure,
              description: copy.erasureDescription,
            },
          ].map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex min-h-14 items-center justify-between gap-3 py-3 outline-none hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-body font-medium text-text">
                    {link.label}
                  </span>
                  <span className="text-body-sm text-text-muted">
                    {link.description}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AccountShell>
  );
}

/** The blocked list, settled: a failed read is a message in its section. */
async function BlockedProfiles({
  locale,
  scope,
}: {
  locale: InterfaceLocale;
  scope: RequestScope;
}) {
  const copy = COPY[locale];
  const blocked = await settleSection(() => listBlockedProfiles(scope), {
    deadlineMs: workspaceSectionDeadlineMs(1),
    surface: "account-settings",
    section: "blocked-profiles",
  });

  if (blocked.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={blocked}
        retryHref={ACCOUNT_SETTINGS_PATH}
      />
    );
  }

  if (blocked.value.length === 0) {
    return <p className="text-body-sm text-text-muted">{copy.blockedEmpty}</p>;
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {blocked.value.map((profile) => (
        <li
          key={profile.blockId}
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
        >
          <div className="min-w-0">
            <p className="text-h4 wrap-anywhere text-text-heading">
              {profile.displayName ?? `@${profile.handle}`}
            </p>
            <p className="text-caption wrap-anywhere text-text-muted">
              @{profile.handle}
            </p>
          </div>
          <OwnerScopedProgressiveForm action={unblockProfileAction}>
            <HiddenField name="blockId" value={profile.blockId} />
            <button
              type="submit"
              aria-label={`${copy.unblock}, ${profile.displayName ?? `@${profile.handle}`}`}
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
              })}
            >
              {copy.unblock}
            </button>
          </OwnerScopedProgressiveForm>
        </li>
      ))}
    </ul>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
