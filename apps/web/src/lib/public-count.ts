import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * A count with its noun in the reader's grammar ("3 записи", "5 снимки"), and
 * nothing else (`OVE-468`). The engagement controls on a public entry are a
 * client component, and reading this through `public-surface-localization.ts`
 * put every public page's copy into their script.
 */
export type PublicCountKind =
  | "entry"
  | "photo"
  | "publicEntry"
  | "like"
  | "form"
  | "gardener"
  | "region"
  | "object";

type CountForms = Record<"one" | "few" | "many" | "other", string>;

const COUNT_FORMS: Record<
  InterfaceLocale,
  Record<PublicCountKind, CountForms>
> = {
  uk: {
    entry: {
      one: "запис",
      few: "записи",
      many: "записів",
      other: "запису",
    },
    photo: { one: "фото", few: "фото", many: "фото", other: "фото" },
    form: { one: "форма", few: "форми", many: "форм", other: "форми" },
    gardener: {
      one: "садівник",
      few: "садівники",
      many: "садівників",
      other: "садівника",
    },
    region: {
      one: "області",
      few: "областях",
      many: "областях",
      other: "області",
    },
    object: {
      one: "об'єкт",
      few: "об'єкти",
      many: "об'єктів",
      other: "об'єкта",
    },
    publicEntry: {
      one: "публічний запис",
      few: "публічні записи",
      many: "публічних записів",
      other: "публічного запису",
    },
    like: {
      one: "вподобання",
      few: "вподобання",
      many: "вподобань",
      other: "вподобання",
    },
  },
  bg: {
    entry: {
      one: "запис",
      few: "записа",
      many: "записа",
      other: "записа",
    },
    photo: {
      one: "снимка",
      few: "снимки",
      many: "снимки",
      other: "снимки",
    },
    form: { one: "форма", few: "форми", many: "форми", other: "форми" },
    gardener: {
      one: "градинар",
      few: "градинари",
      many: "градинари",
      other: "градинари",
    },
    region: {
      one: "област",
      few: "области",
      many: "области",
      other: "области",
    },
    object: { one: "обект", few: "обекта", many: "обекта", other: "обекта" },
    publicEntry: {
      one: "публичен запис",
      few: "публични записа",
      many: "публични записа",
      other: "публични записа",
    },
    like: {
      one: "харесване",
      few: "харесвания",
      many: "харесвания",
      other: "харесвания",
    },
  },
  ru: {
    entry: {
      one: "запись",
      few: "записи",
      many: "записей",
      other: "записи",
    },
    photo: { one: "фото", few: "фото", many: "фото", other: "фото" },
    form: { one: "форма", few: "формы", many: "форм", other: "формы" },
    gardener: {
      one: "садовод",
      few: "садовода",
      many: "садоводов",
      other: "садовода",
    },
    region: {
      one: "области",
      few: "областях",
      many: "областях",
      other: "областях",
    },
    object: {
      one: "объект",
      few: "объекта",
      many: "объектов",
      other: "объекта",
    },
    publicEntry: {
      one: "публичная запись",
      few: "публичные записи",
      many: "публичных записей",
      other: "публичной записи",
    },
    like: {
      one: "отметка нравится",
      few: "отметки нравится",
      many: "отметок нравится",
      other: "отметки нравится",
    },
  },
};

export function formatPublicCount(
  locale: InterfaceLocale,
  kind: PublicCountKind,
  count: number,
) {
  const category = new Intl.PluralRules(locale).select(count);
  const forms = COUNT_FORMS[locale][kind];
  const form = forms[category as keyof CountForms] ?? forms.other;

  return `${count} ${form}`;
}
