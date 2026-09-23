import Link from "next/link";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { cn } from "@/lib/utils";

/**
 * The account's three pages, as one row of links (`OVE-503`).
 *
 * Public profile, settings, sign-in and security: each its own page with its
 * own forms, so changing a bio never walks past a handle migration or a
 * sign-in method. The row says which page this is, and every page is one
 * press from the others.
 */
export const ACCOUNT_SECTIONS = [
  { key: "profile", href: "/garden/profile" },
  { key: "settings", href: "/account/settings" },
  { key: "security", href: "/account/security" },
] as const;

export type AccountSectionKey = (typeof ACCOUNT_SECTIONS)[number]["key"];

const COPY: Record<
  InterfaceLocale,
  { label: string } & Record<AccountSectionKey, string>
> = {
  uk: {
    label: "Розділи акаунта",
    profile: "Публічний профіль",
    settings: "Налаштування",
    security: "Вхід і безпека",
  },
  bg: {
    label: "Раздели на профила",
    profile: "Публичен профил",
    settings: "Настройки",
    security: "Вход и сигурност",
  },
  ru: {
    label: "Разделы аккаунта",
    profile: "Публичный профиль",
    settings: "Настройки",
    security: "Вход и безопасность",
  },
};

export function getAccountSectionCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

export function AccountSections({
  locale,
  current,
}: {
  locale: InterfaceLocale;
  current: AccountSectionKey;
}) {
  const copy = COPY[locale];
  return (
    <nav aria-label={copy.label} data-account-sections="true">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {ACCOUNT_SECTIONS.map((section) => (
          <li key={section.key}>
            <Link
              href={section.href}
              aria-current={section.key === current ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center border-b-2 px-3 text-body-sm font-medium",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                section.key === current
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {copy[section.key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
