"use client";

import type { InterfaceLocale } from "@/lib/interface-localization";

const COPY: Record<InterfaceLocale, string> = {
  uk: "Локальне сховище власника більше не використовується журналом.",
  bg: "Локалното хранилище на собственика вече не се използва от дневника.",
  ru: "Локальное хранилище владельца больше не используется журналом.",
};

/** Compatibility route retained only until OVE-323 removes retired fixtures. */
export function OwnerVaultVisualFixture({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  return (
    <main
      lang={locale}
      data-owner-vault-runtime="retired"
      className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-3 p-6"
    >
      <h1 className="text-2xl font-semibold">Owner vault retired</h1>
      <p className="text-sm text-muted-foreground">{COPY[locale]}</p>
    </main>
  );
}
