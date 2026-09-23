import type { PublicLocale } from "@/lib/public-localization";

/**
 * A species' forms, as the register view names them (OVE-433; `OVE-497`).
 *
 * The view lists every public form of the species — registered or not — with
 * the registration number where there is one. It used to be titled "621
 * сортів … у реєстрах", which claimed a register for every row and a cultivar
 * for every breed. A plant's forms are its cultivars, an animal's its breeds,
 * and anything else keeps the catalogue's own word, forms.
 */
export type RegisterFormsKind = "plant" | "animal" | "other";

export function registerFormsKind(kingdom: string | null): RegisterFormsKind {
  if (kingdom === "Plantae") return "plant";
  if (kingdom === "Animalia") return "animal";
  return "other";
}

export interface PublicCatalogRegisterCopy {
  readonly heading: (species: string, kind: RegisterFormsKind) => string;
  readonly metadataTitle: (
    species: string,
    kind: RegisterFormsKind,
    total: number,
  ) => string;
  readonly description: (
    species: string,
    kind: RegisterFormsKind,
    total: number,
  ) => string;
  readonly total: (count: number) => string;
  readonly registeredUa: (count: number) => string;
  readonly registeredEu: (count: number) => string;
  readonly backToSpecies: string;
  readonly columnName: string;
  readonly columnRegister: string;
  readonly uaRegisterLabel: string;
  readonly euCatalogueLabel: string;
  readonly noRegisterNumber: string;
  /** A form in neither register: the cell says so rather than "no number". */
  readonly notRegistered: string;
  readonly sourceNote: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchSubmit: string;
  readonly searchResult: (count: number, query: string) => string;
  readonly noResults: (query: string) => string;
  readonly showAll: string;
  readonly paginationLabel: string;
  readonly pageOf: (page: number, pageCount: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
}

const UK_NOUN: Record<RegisterFormsKind, string> = {
  plant: "Сорти",
  animal: "Породи",
  other: "Форми",
};

const UK: PublicCatalogRegisterCopy = {
  heading: (species, kind) => `${UK_NOUN[kind]} виду «${species}»`,
  metadataTitle: (species, kind, total) =>
    `${UK_NOUN[kind]} виду «${species}»: ${total.toLocaleString("uk-UA")} | OverGarden`,
  description: (species, kind, total) =>
    `${UK_NOUN[kind]} виду «${species}» у каталозі OverGarden — ${total.toLocaleString("uk-UA")}, з реєстраційними номерами там, де їх зареєстровано.`,
  total: (count) => `Усього: ${count.toLocaleString("uk-UA")}`,
  registeredUa: (count) =>
    `${count.toLocaleString("uk-UA")} у Держреєстрі України`,
  registeredEu: (count) =>
    `${count.toLocaleString("uk-UA")} у Спільному каталозі ЄС`,
  backToSpecies: "До картки виду",
  columnName: "Назва",
  columnRegister: "Реєстрація",
  uaRegisterLabel: "Держреєстр України",
  euCatalogueLabel: "Спільний каталог ЄС",
  noRegisterNumber: "Номер не вказано",
  notRegistered: "Не в цих реєстрах",
  sourceNote:
    "Назви й номери — з державних реєстрів і джерел каталогу. Кожна назва веде на власну сторінку.",
  searchLabel: "Знайти за назвою",
  searchPlaceholder: "Наприклад, Де Барао",
  searchSubmit: "Шукати",
  searchResult: (count, query) =>
    `За «${query}» знайдено: ${count.toLocaleString("uk-UA")}`,
  noResults: (query) => `За «${query}» нічого не знайдено.`,
  showAll: "Показати всі",
  paginationLabel: "Сторінки",
  pageOf: (page, pageCount) => `Сторінка ${page} з ${pageCount}`,
  previousPage: "Попередня сторінка",
  nextPage: "Наступна сторінка",
};

const BG_NOUN: Record<RegisterFormsKind, string> = {
  plant: "Сортове",
  animal: "Породи",
  other: "Форми",
};

const BG: PublicCatalogRegisterCopy = {
  heading: (species, kind) => `${BG_NOUN[kind]} на вида „${species}“`,
  metadataTitle: (species, kind, total) =>
    `${BG_NOUN[kind]} на вида „${species}“: ${total.toLocaleString("bg-BG")} | OverGarden`,
  description: (species, kind, total) =>
    `${BG_NOUN[kind]} на вида „${species}“ в каталога на OverGarden — ${total.toLocaleString("bg-BG")}, с регистрационни номера, където са регистрирани.`,
  total: (count) => `Общо: ${count.toLocaleString("bg-BG")}`,
  registeredUa: (count) =>
    `${count.toLocaleString("bg-BG")} в Държавния регистър на Украйна`,
  registeredEu: (count) =>
    `${count.toLocaleString("bg-BG")} в Общия каталог на ЕС`,
  backToSpecies: "Към картата на вида",
  columnName: "Име",
  columnRegister: "Регистрация",
  uaRegisterLabel: "Държавен регистър на Украйна",
  euCatalogueLabel: "Общ каталог на ЕС",
  noRegisterNumber: "Няма номер",
  notRegistered: "Не е в тези регистри",
  sourceNote:
    "Имената и номерата са от държавните регистри и източниците на каталога. Всяко име води към собствена страница.",
  searchLabel: "Търсене по име",
  searchPlaceholder: "Например, Де Барао",
  searchSubmit: "Търсене",
  searchResult: (count, query) =>
    `За „${query}“ са намерени: ${count.toLocaleString("bg-BG")}`,
  noResults: (query) => `За „${query}“ няма нищо.`,
  showAll: "Покажи всички",
  paginationLabel: "Страници",
  pageOf: (page, pageCount) => `Страница ${page} от ${pageCount}`,
  previousPage: "Предишна страница",
  nextPage: "Следваща страница",
};

const RU_NOUN: Record<RegisterFormsKind, string> = {
  plant: "Сорта",
  animal: "Породы",
  other: "Формы",
};

const RU: PublicCatalogRegisterCopy = {
  heading: (species, kind) => `${RU_NOUN[kind]} вида «${species}»`,
  metadataTitle: (species, kind, total) =>
    `${RU_NOUN[kind]} вида «${species}»: ${total.toLocaleString("ru-RU")} | OverGarden`,
  description: (species, kind, total) =>
    `${RU_NOUN[kind]} вида «${species}» в каталоге OverGarden — ${total.toLocaleString("ru-RU")}, с регистрационными номерами там, где они зарегистрированы.`,
  total: (count) => `Всего: ${count.toLocaleString("ru-RU")}`,
  registeredUa: (count) =>
    `${count.toLocaleString("ru-RU")} в Госреестре Украины`,
  registeredEu: (count) =>
    `${count.toLocaleString("ru-RU")} в Общем каталоге ЕС`,
  backToSpecies: "К карточке вида",
  columnName: "Название",
  columnRegister: "Регистрация",
  uaRegisterLabel: "Госреестр Украины",
  euCatalogueLabel: "Общий каталог ЕС",
  noRegisterNumber: "Номер не указан",
  notRegistered: "Нет в этих реестрах",
  sourceNote:
    "Названия и номера — из государственных реестров и источников каталога. Каждое название ведёт на свою страницу.",
  searchLabel: "Найти по названию",
  searchPlaceholder: "Например, Де Барао",
  searchSubmit: "Искать",
  searchResult: (count, query) =>
    `По «${query}» найдено: ${count.toLocaleString("ru-RU")}`,
  noResults: (query) => `По «${query}» ничего не найдено.`,
  showAll: "Показать все",
  paginationLabel: "Страницы",
  pageOf: (page, pageCount) => `Страница ${page} из ${pageCount}`,
  previousPage: "Предыдущая страница",
  nextPage: "Следующая страница",
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
