import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";

import { AccountSections } from "./account-sections";

export const ACCOUNT_SETTINGS_PATH = "/account/settings";
export const ACCOUNT_SECURITY_PATH = "/account/security";

const COPY = {
  uk: {
    settingsTitle: "Налаштування",
    settingsDescription:
      "Мова інтерфейсу, профілі, які ви заблокували, і ваші дані.",
    securityTitle: "Вхід і безпека",
    securityDescription:
      "Як ви входите в OverGarden і як завершити вхід у цьому браузері.",
    back: "До мого саду",
  },
  bg: {
    settingsTitle: "Настройки",
    settingsDescription:
      "Езикът на интерфейса, профилите, които сте блокирали, и вашите данни.",
    securityTitle: "Вход и сигурност",
    securityDescription:
      "Как влизате в OverGarden и как да излезете от този браузър.",
    back: "Към моята градина",
  },
  ru: {
    settingsTitle: "Настройки",
    settingsDescription:
      "Язык интерфейса, профили, которые вы заблокировали, и ваши данные.",
    securityTitle: "Вход и безопасность",
    securityDescription:
      "Как вы входите в OverGarden и как завершить вход в этом браузере.",
    back: "К моему саду",
  },
} as const;

export function getAccountPageCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

/**
 * The shell of an account page (`OVE-503`), shared by the page, its
 * `loading.tsx` and its signed-out state, so the heading, the way back and
 * the row of account pages never move (ADR-0023).
 */
export function AccountShell({
  locale,
  section,
  state,
  children,
}: {
  locale: InterfaceLocale;
  section: "settings" | "security";
  state?: "loading";
  children: ReactNode;
}) {
  const copy = COPY[locale];
  return (
    <WorkspaceShell
      surface={section === "settings" ? "account-settings" : "account-security"}
      locale={locale}
      state={state}
      title={section === "settings" ? copy.settingsTitle : copy.securityTitle}
      description={
        section === "settings"
          ? copy.settingsDescription
          : copy.securityDescription
      }
      navigation={
        <Link
          href="/garden"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
          data-testid="account-return-navigation"
        >
          <ArrowLeft aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      <AccountSections locale={locale} current={section} />
      {children}
    </WorkspaceShell>
  );
}
