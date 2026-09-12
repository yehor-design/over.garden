import type { PublicLocale } from "@/lib/public-localization";
import type { CatalogBrowseKingdom } from "@/lib/public-catalog-browse";

export interface PublicCatalogBrowseCopy {
  readonly title: string;
  readonly metadataTitle: string;
  readonly description: string;
  readonly firstHandHeading: string;
  readonly firstHandDescription: string;
  readonly kingdomsHeading: string;
  readonly registersHeading: string;
  readonly organismCount: (total: number) => string;
  readonly allInitials: string;
  readonly backToKingdoms: string;
  readonly pageOf: (page: number, pageCount: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly emptyInitial: string;
  readonly kingdom: Readonly<Record<CatalogBrowseKingdom, string>>;
}

const UK: PublicCatalogBrowseCopy = {
  title: "Каталог організмів",
  metadataTitle: "Каталог організмів | OverGarden",
  description:
    "Рослини, тварини, гриби й інші організми, про які ведуть журнали в OverGarden — за царствами й за першою літерою назви.",
  firstHandHeading: "Про що вже писали садівники",
  firstHandDescription:
    "Картки, у яких є хоча б один публічний запис із першоджерела.",
  kingdomsHeading: "За царствами",
  registersHeading: "Сорти в державних реєстрах",
  organismCount: (total) => `${total.toLocaleString("uk-UA")} організмів`,
  allInitials: "Усі літери",
  backToKingdoms: "До всіх царств",
  pageOf: (page, pageCount) => `Сторінка ${page} з ${pageCount}`,
  previousPage: "Попередня сторінка",
  nextPage: "Наступна сторінка",
  emptyInitial: "На цю літеру тут поки нічого немає.",
  kingdom: {
    Plantae: "Рослини",
    Animalia: "Тварини",
    Fungi: "Гриби",
    Bacteria: "Бактерії",
    Chromista: "Хромісти",
    Viruses: "Віруси",
    Protozoa: "Найпростіші",
    Archaea: "Археї",
  },
};

const BG: PublicCatalogBrowseCopy = {
  title: "Каталог на организмите",
  metadataTitle: "Каталог на организмите | OverGarden",
  description:
    "Растения, животни, гъби и други организми, за които се водят дневници в OverGarden — по царства и по първа буква на името.",
  firstHandHeading: "За какво вече са писали градинарите",
  firstHandDescription:
    "Картите с поне един публичен запис от първа ръка.",
  kingdomsHeading: "По царства",
  registersHeading: "Сортове в държавните регистри",
  organismCount: (total) => `${total.toLocaleString("bg-BG")} организма`,
  allInitials: "Всички букви",
  backToKingdoms: "Към всички царства",
  pageOf: (page, pageCount) => `Страница ${page} от ${pageCount}`,
  previousPage: "Предишна страница",
  nextPage: "Следваща страница",
  emptyInitial: "За тази буква още няма нищо тук.",
  kingdom: {
    Plantae: "Растения",
    Animalia: "Животни",
    Fungi: "Гъби",
    Bacteria: "Бактерии",
    Chromista: "Хромисти",
    Viruses: "Вируси",
    Protozoa: "Протозои",
    Archaea: "Археи",
  },
};

const RU: PublicCatalogBrowseCopy = {
  title: "Каталог организмов",
  metadataTitle: "Каталог организмов | OverGarden",
  description:
    "Растения, животные, грибы и другие организмы, о которых ведут журналы в OverGarden — по царствам и по первой букве названия.",
  firstHandHeading: "О чём уже писали садоводы",
  firstHandDescription:
    "Карточки, где есть хотя бы одна публичная запись из первых рук.",
  kingdomsHeading: "По царствам",
  registersHeading: "Сорта в государственных реестрах",
  organismCount: (total) => `${total.toLocaleString("ru-RU")} организмов`,
  allInitials: "Все буквы",
  backToKingdoms: "Ко всем царствам",
  pageOf: (page, pageCount) => `Страница ${page} из ${pageCount}`,
  previousPage: "Предыдущая страница",
  nextPage: "Следующая страница",
  emptyInitial: "На эту букву здесь пока ничего нет.",
  kingdom: {
    Plantae: "Растения",
    Animalia: "Животные",
    Fungi: "Грибы",
    Bacteria: "Бактерии",
    Chromista: "Хромисты",
    Viruses: "Вирусы",
    Protozoa: "Простейшие",
    Archaea: "Археи",
  },
};

const COPY: Readonly<Record<PublicLocale, PublicCatalogBrowseCopy>> = {
  uk: UK,
  bg: BG,
  ru: RU,
};

export function getPublicCatalogBrowseCopy(
  locale: PublicLocale,
): PublicCatalogBrowseCopy {
  return COPY[locale];
}
