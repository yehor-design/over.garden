"use client";

import type { InterfaceLocale } from "@/lib/interface-localization";

const COPY: Record<InterfaceLocale, { title: string; description: string }> = {
  uk: {
    title: "Автосинхронізацію черги вимкнено",
    description:
      "Журнал тепер зберігає приватні чернетки безпосередньо на сервері.",
  },
  bg: {
    title: "Автоматичната синхронизация на опашката е изключена",
    description: "Дневникът вече записва личните чернови директно на сървъра.",
  },
  ru: {
    title: "Автосинхронизация очереди отключена",
    description:
      "Журнал теперь сохраняет личные черновики напрямую на сервере.",
  },
};

/** Compatibility route retained only until OVE-323 deletes retired fixtures. */
export function ForegroundAutosyncVisualFixture({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  return (
    <main
      lang={locale}
      data-testid="foreground-autosync-fixture"
      data-legacy-autosync="retired"
      className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-3 p-6"
    >
      <h1 className="text-2xl font-semibold">{COPY[locale].title}</h1>
      <p className="text-sm text-muted-foreground">
        {COPY[locale].description}
      </p>
    </main>
  );
}
