import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

import { LocationPrivacyControl } from "./location-privacy-control";

describe("LocationPrivacyControl", () => {
  it.each([
    ["uk", "Приватність місця", "Україна — місто Київ"],
    ["bg", "Поверителност на местоположението", "Украйна — град Киев"],
    ["ru", "Конфиденциальность местоположения", "Украина — город Киев"],
  ] as const satisfies readonly [InterfaceLocale, string, string][])(
    "explains public consequences in %s where the gardener selects visibility",
    (locale, title, regionLabel) => {
      const html = renderToStaticMarkup(
        <LocationPrivacyControl
          locale={locale}
          objectId="00000000-0000-4000-8000-000000000001"
          currentLocationVisibility="region"
          currentCoarseRegionCode="UA-30"
          action={vi.fn()}
        />,
      );

      expect(html).toContain(title);
      expect(html).toContain(regionLabel);
      expect(html).toContain("min-w-0");
      expect(html).not.toMatch(
        /Location privacy|Choose region|Exact location/i,
      );
      expect(html).not.toMatch(
        /\b(address|coordinates?|latitude|longitude|ip_address|user[_ -]?agent)\b/i,
      );
    },
  );
});
