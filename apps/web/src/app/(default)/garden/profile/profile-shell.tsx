import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";

export const GARDEN_PROFILE_PATH = "/garden/profile";

export const COPY = {
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

/**
 * The profile shell, shared by this page, its `loading.tsx`, and the signed-out
 * state, so the heading and the way back never move (ADR-0023).
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
            className={buttonVariants({ variant: "outline", size: "sm" })}
            data-testid="profile-return-navigation"
          >
            <ArrowLeft aria-hidden="true" />
            {copy.back}
          </Link>
        }
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
