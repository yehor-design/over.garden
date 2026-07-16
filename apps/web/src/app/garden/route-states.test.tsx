import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteShellLocaleProvider } from "@/components/site-shell/site-shell-locale-context";
import type { InterfaceLocale } from "@/lib/interface-localization";
import GardenError from "./error";
import { GardenLoadingView } from "./loading";

const LOCALE_EXPECTATIONS = [
  {
    locale: "uk",
    loading: "Завантаження вашого саду",
    inventory: "Живі об'єкти",
    recent: "Останні події",
    error: "Дані простору тимчасово недоступні",
    retry: "Спробувати ще раз",
  },
  {
    locale: "bg",
    loading: "Зареждане на вашата градина",
    inventory: "Живи обекти",
    recent: "Последна история",
    error: "Данните за работното пространство временно не са достъпни",
    retry: "Опитайте отново",
  },
  {
    locale: "ru",
    loading: "Загрузка вашего сада",
    inventory: "Живые объекты",
    recent: "Последние события",
    error: "Данные рабочего пространства временно недоступны",
    retry: "Попробовать снова",
  },
] as const satisfies ReadonlyArray<{
  locale: InterfaceLocale;
  loading: string;
  inventory: string;
  recent: string;
  error: string;
  retry: string;
}>;

describe("/garden route states", () => {
  it.each(LOCALE_EXPECTATIONS)(
    "keeps the $locale workspace hierarchy localized while owner data streams",
    ({ locale, loading, inventory, recent }) => {
      const html = renderToStaticMarkup(<GardenLoadingView locale={locale} />);

      expect(html).toContain('data-garden-workspace="loading"');
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(loading);
      expect(html).toContain(inventory.replaceAll("'", "&#x27;"));
      expect(html).toContain(recent);
    },
  );

  it.each(LOCALE_EXPECTATIONS)(
    "offers a localized $locale recovery action without rendering details",
    ({ locale, error, retry }) => {
      const html = renderToStaticMarkup(
        <SiteShellLocaleProvider locale={locale}>
          <GardenError
            error={new Error("private database detail")}
            reset={vi.fn()}
          />
        </SiteShellLocaleProvider>,
      );

      expect(html).toContain('data-garden-workspace="unexpected-error"');
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(error);
      expect(html).toContain(retry);
      expect(html).not.toContain("private database detail");
    },
  );
});
