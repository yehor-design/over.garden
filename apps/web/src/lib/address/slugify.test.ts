import { describe, expect, it } from "vitest";

import { DEFAULT_ADDRESS_BUDGET } from "./address-manifest";
import { isAddressSlug } from "./address-contract.generated";
import { fitsAddressBudget, reservedAsTaken, slugify } from "./slugify";

const ENTRY = { script: "native", language: "uk", fallback: "entry" } as const;
const BULGARIAN_ENTRY = {
  script: "native",
  language: "bg",
  fallback: "entry",
} as const;

describe("one slugifier (ADR-0029 D4, D5)", () => {
  it("keeps ї and й, which NFKD used to take apart", () => {
    // The whole defect, in one line: `ї` is `і` plus a combining diaeresis, so
    // decomposing and stripping marks spelled this `календарноі`, and the
    // suffix hid how wrong the rest was.
    expect(slugify("Полив без календарної пастки", ENTRY)).toBe(
      "полив-без-календарної-пастки",
    );
    expect(slugify("Перший рій", ENTRY)).toBe("перший-рій");
    expect(slugify("Ґанок і їжак", ENTRY)).toBe("ґанок-і-їжак");
  });

  it("does not split a Bulgarian й into two words", () => {
    // Production still holds `наблюдение-деи-ствие-…`, written by the old
    // generator: `й` decomposed, the breve became a separator, and one word
    // became two. The budget cuts `проверка` off the end, which is a different
    // thing and correct — thirty-nine Cyrillic characters is over the encoded
    // bound.
    expect(slugify("Наблюдение, действие и следваща проверка", BULGARIAN_ENTRY)).toBe(
      "наблюдение-действие-и-следваща",
    );
    expect(slugify("Кратък отговор", BULGARIAN_ENTRY)).toBe("кратък-отговор");
  });

  it("drops the apostrophe before the separator pass, not with it", () => {
    expect(slugify("Зав'язування плодів", ENTRY)).toBe("завязування-плодів");
    expect(slugify("Зав’язування плодів", ENTRY)).toBe("завязування-плодів");
  });

  it("truncates at the last hyphen that fits the encoded budget", () => {
    // Thirty-six characters decoded is inside the sixty-character bound and
    // outside the hundred-and-eighty-character encoded one, because a Cyrillic
    // character costs six encoded. `сталий` survives; `сезону` does not.
    const slug = slugify("Обкладинка як сталий орієнтир сезону", ENTRY);
    expect(slug).toBe("обкладинка-як-сталий-орієнтир");
    expect(slug).toContain("сталий");
    expect(slug.endsWith("-")).toBe(false);
    expect(fitsAddressBudget(slug, DEFAULT_ADDRESS_BUDGET)).toBe(true);
  });

  it("bounds a sixty-character Cyrillic slug at a hundred and eighty encoded", () => {
    const slug = slugify(
      "Дуже довгий заголовок про полив томатів у серпні та вересні на грядці",
      ENTRY,
    );
    expect(encodeURIComponent(slug).length).toBeLessThanOrEqual(180);
    expect([...slug].length).toBeLessThanOrEqual(60);
    expect(isAddressSlug("journalEntry", slug)).toBe(true);
  });

  it("cuts inside the first word rather than answering nothing", () => {
    const slug = slugify("Абвгдеєжзиійклмнопрстуфхцчшщьюя", ENTRY);
    expect(slug.length).toBeGreaterThan(0);
    expect(fitsAddressBudget(slug, DEFAULT_ADDRESS_BUDGET)).toBe(true);
  });

  it("folds a Latin diacritic without touching a Cyrillic one", () => {
    expect(slugify("Café Noir", ENTRY)).toBe("cafe-noir");
    expect(slugify("Grüße", ENTRY)).toBe("grusse");
    expect(slugify("Fragaria × ananassa", ENTRY)).toBe("fragaria-x-ananassa");
  });

  it("falls back rather than returning an address nothing can route", () => {
    expect(slugify("?!.", ENTRY)).toBe("entry");
    expect(slugify("   ", ENTRY)).toBe("entry");
    expect(slugify("日本語", ENTRY)).toBe("entry");
  });

  it("romanizes for a Latin namespace and stays ASCII", () => {
    expect(
      slugify("Промінь", { script: "latin", language: "uk", fallback: "variety" }),
    ).toBe("promin");
    expect(
      slugify("Щастливец", { script: "latin", language: "bg", fallback: "variety" }),
    ).toBe("shtastlivets");
    expect(
      slugify("Solanum lycopersicum", {
        script: "latin",
        language: "latin",
        fallback: "species",
      }),
    ).toBe("solanum-lycopersicum");
  });

  it("always answers something the guard and the CHECK both accept", () => {
    for (const title of [
      "Полив без календарної пастки",
      "Зав'язування — три сигнали!",
      "  ---  ",
      "№ 42 / томат",
      "Ёлка и ъ",
      "ОБКЛАДИНКА",
    ]) {
      const slug = slugify(title, ENTRY);
      expect(isAddressSlug("journalEntry", slug), `${title} -> ${slug}`).toBe(
        true,
      );
    }
  });

  it("seeds the collision counter with what a route segment already owns", () => {
    expect([...reservedAsTaken(["objects"], ["полив"])].sort()).toEqual([
      "objects",
      "полив",
    ]);
  });
});
