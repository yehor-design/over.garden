import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { AccountSections } from "@/app/(default)/account/account-sections";

export const GARDEN_PROFILE_PATH = "/garden/profile";

export const COPY = {
  uk: {
    title: "Мій публічний профіль",
    back: "До мого саду",
    open: "Відкрити публічний профіль",
  },
  bg: {
    title: "Моят публичен профил",
    back: "Към моята градина",
    open: "Отвори публичния профил",
  },
  ru: {
    title: "Мой публичный профиль",
    back: "К моему саду",
    open: "Открыть публичный профиль",
  },
} as const;

/**
 * The profile shell, shared by this page, its `loading.tsx`, and the signed-out
 * state, so the heading, the way back and the row of account pages never move
 * (ADR-0023, `OVE-503`).
 */
export function ProfileShell({
  locale,
  state,
  authShell,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  authShell?: "guest";
  children: ReactNode;
}) {
  const copy = COPY[locale];
  return (
    <div data-garden-profile-auth-shell={authShell}>
      <WorkspaceShell
        surface="profile"
        locale={locale}
        state={state}
        title={copy.title}
        navigation={
          <Link
            href="/garden"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
            data-testid="profile-return-navigation"
          >
            <ArrowLeft aria-hidden="true" />
            {copy.back}
          </Link>
        }
      >
        <AccountSections locale={locale} current="profile" />
        {children}
      </WorkspaceShell>
    </div>
  );
}
