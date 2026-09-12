import type { PublicLocale } from "@/lib/public-localization";

export interface PublicCatalogRegisterCopy {
  readonly heading: (species: string, total: number) => string;
  readonly metadataTitle: (species: string, total: number) => string;
  readonly description: (species: string, total: number) => string;
  readonly registeredUa: (count: number) => string;
  readonly registeredEu: (count: number) => string;
  readonly backToSpecies: string;
  readonly columnName: string;
  readonly columnRegister: string;
  readonly uaRegisterLabel: string;
  readonly euCatalogueLabel: string;
  readonly noRegisterNumber: string;
  readonly sourceNote: string;
}

const UK: PublicCatalogRegisterCopy = {
  heading: (species, total) => `${total} сортів ${species} у реєстрах`,
  metadataTitle: (species, total) =>
    `${total} сортів ${species} у реєстрах | OverGarden`,
  description: (species, total) =>
    `Сорти виду ${species} із Державного реєстру сортів рослин України та Спільного каталогу ЄС — ${total} записів із реєстраційними номерами.`,
  registeredUa: (count) => `${count} у Держреєстрі України`,
  registeredEu: (count) => `${count} у Спільному каталозі ЄС`,
  backToSpecies: "До картки виду",
  columnName: "Сорт",
  columnRegister: "Реєстрація",
  uaRegisterLabel: "Держреєстр України",
  euCatalogueLabel: "Спільний каталог ЄС",
  noRegisterNumber: "Номер не вказано",
  sourceNote:
    "Дані зведено з відкритих державних реєстрів. Кожен сорт має власну сторінку з повним записом.",
};

const BG: PublicCatalogRegisterCopy = {
  heading: (species, total) => `${total} сорта ${species} в регистрите`,
  metadataTitle: (species, total) =>
    `${total} сорта ${species} в регистрите | OverGarden`,
  description: (species, total) =>
    `Сортове от вида ${species} в Държавния регистър на Украйна и Общия каталог на ЕС — ${total} записа с регистрационни номера.`,
  registeredUa: (count) => `${count} в Държавния регистър на Украйна`,
  registeredEu: (count) => `${count} в Общия каталог на ЕС`,
  backToSpecies: "Към картата на вида",
  columnName: "Сорт",
  columnRegister: "Регистрация",
  uaRegisterLabel: "Държавен регистър на Украйна",
  euCatalogueLabel: "Общ каталог на ЕС",
  noRegisterNumber: "Няма номер",
  sourceNote:
    "Данните са събрани от открити държавни регистри. Всеки сорт има собствена страница с пълния запис.",
};

const RU: PublicCatalogRegisterCopy = {
  heading: (species, total) => `${total} сортов ${species} в реестрах`,
  metadataTitle: (species, total) =>
    `${total} сортов ${species} в реестрах | OverGarden`,
  description: (species, total) =>
    `Сорта вида ${species} из Государственного реестра сортов растений Украины и Общего каталога ЕС — ${total} записей с регистрационными номерами.`,
  registeredUa: (count) => `${count} в Госреестре Украины`,
  registeredEu: (count) => `${count} в Общем каталоге ЕС`,
  backToSpecies: "К карточке вида",
  columnName: "Сорт",
  columnRegister: "Регистрация",
  uaRegisterLabel: "Госреестр Украины",
  euCatalogueLabel: "Общий каталог ЕС",
  noRegisterNumber: "Номер не указан",
  sourceNote:
    "Данные сведены из открытых государственных реестров. У каждого сорта есть своя страница с полной записью.",
};

const COPY: Readonly<Record<PublicLocale, PublicCatalogRegisterCopy>> = {
  uk: UK,
  bg: BG,
  ru: RU,
};

export function getPublicCatalogRegisterCopy(
  locale: PublicLocale,
): PublicCatalogRegisterCopy {
  return COPY[locale];
}
