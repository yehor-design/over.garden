"use client";

import { useActionState } from "react";
import { CheckIcon as Check } from "@/components/icons/Check";

import { setInterfaceLocaleAction } from "@/components/public/locale-actions";
import { buttonVariants } from "@/components/ui/button";
import { HiddenField } from "@/components/ui/hidden-field";
import {
  INTERFACE_LOCALE_CHOICES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";
import { cn } from "@/lib/utils";

/**
 * The interface language, as a setting (`OVE-503`).
 *
 * The shell carries the same choice as a compact menu on every page; here it
 * is spelled out, one button per language, each its own form over the one
 * action that writes the preference. A form with a real endpoint works before
 * the bundle has run, and the page re-renders in place in the new language —
 * an account page has no prefixed address to move to.
 */
export function InterfaceLanguageSetting({
  locale,
  label,
}: {
  locale: PublicLocale;
  /** Names the group: "Мова інтерфейсу". */
  label: string;
}) {
  return (
    <ul
      role="list"
      aria-label={label}
      data-interface-language-setting="true"
      className="flex list-none flex-wrap gap-2"
    >
      {INTERFACE_LOCALE_CHOICES.map((choice) => (
        <li key={choice}>
          <LanguageChoice locale={choice} selected={choice === locale} />
        </li>
      ))}
    </ul>
  );
}

function LanguageChoice({
  locale,
  selected,
}: {
  locale: PublicLocale;
  selected: boolean;
}) {
  const [, formAction] = useActionState(setInterfaceLocaleAction, null);
  const config = PUBLIC_LOCALE_CONFIG[locale];

  return (
    <form action={formAction}>
      <HiddenField name="locale" value={locale} />
      <button
        type="submit"
        lang={config.htmlLang}
        aria-pressed={selected}
        data-interface-locale={locale}
        className={cn(
          buttonVariants({
            variant: selected ? "primary" : "secondary",
            size: "sm",
          }),
        )}
      >
        {selected ? <Check aria-hidden="true" /> : null}
        {config.label}
      </button>
    </form>
  );
}
