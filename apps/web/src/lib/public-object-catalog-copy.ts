import type { CatalogKind, PlantObjectKind } from "@/db/schema";
import type { PublicLocale } from "@/lib/public-localization";
import type { PublicObjectCatalogIdentityState } from "@/server/public-object-catalog-repository";

export interface PublicObjectCatalogCopy {
  metadataTitle: string;
  metadataDescription: string;
  heading: string;
  intro: string;
  kindFilterLabel: string;
  identityFilterLabel: string;
  kinds: Record<"all" | PlantObjectKind, string>;
  identities: Record<
    | "all"
    | CatalogKind
    | "bee_breed"
    | "provisional"
    | "unknown"
    | "unavailable",
    string
  >;
  searchLabel: string;
  searchPlaceholder: string;
  searchSubmit: string;
  clearSearch: string;
  suggestionsLabel: string;
  suggestionsLoading: string;
  suggestionsUnavailable: string;
  resultsTitle: string;
  resetFilters: string;
  previousPage: string;
  nextPage: string;
  pageLabel: string;
  emptyTitle: string;
  emptyBody: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  openCatalog: string;
  openPassport: string;
  openJournal: string;
  latestJournal: string;
  noImage: string;
  identityBadges: Record<PublicObjectCatalogIdentityState, string>;
  contextKindsTitle: string;
  contextEvidenceTitle: string;
}

const COPY = {
  uk: {
    metadataTitle: "Живі об'єкти | OverGarden",
    metadataDescription:
      "Рослини, тварини та бджолосім'ї з реальними публічними журналами й чесно позначеною ідентичністю.",
    heading: "Живі об'єкти",
    intro:
      "Рослини, тварини та бджолосім'ї, про які вже є публічні спостереження.",
    kindFilterLabel: "Класи живих об'єктів",
    identityFilterLabel: "Рівень ідентичності",
    kinds: {
      all: "Усі",
      plant: "Рослини",
      animal: "Тварини",
      bee_colony: "Бджолосім'ї",
    },
    identities: {
      all: "Усі ідентичності",
      plant_variety: "Сорти",
      species: "Види",
      breed: "Породи",
      bee_breed: "Породи та лінії",
      provisional: "Робочі назви",
      unknown: "Не визначено",
      unavailable: "Недоступні",
    },
    searchLabel: "Пошук живих об'єктів",
    searchPlaceholder: "Вид, сорт, порода або назва об'єкта",
    searchSubmit: "Знайти",
    clearSearch: "Очистити пошук",
    suggestionsLabel: "Знайдені ідентичності",
    suggestionsLoading: "Пошук...",
    suggestionsUnavailable: "Підказки тимчасово недоступні.",
    resultsTitle: "Публічні докази",
    resetFilters: "Скинути фільтри",
    previousPage: "Попередня",
    nextPage: "Наступна",
    pageLabel: "Сторінка",
    emptyTitle: "Нічого не знайдено",
    emptyBody:
      "Для цього поєднання ще немає публічних журналів. Змініть фільтр або скиньте пошук.",
    loadingLabel: "Завантаження каталогу живих об'єктів",
    errorTitle: "Каталог тимчасово недоступний",
    errorBody:
      "Публічні журнали залишаються доступними. Повторіть запит до каталогу трохи пізніше.",
    retry: "Повторити",
    openCatalog: "Відкрити ідентичність",
    openPassport: "Відкрити паспорт",
    openJournal: "Відкрити журнал",
    latestJournal: "Останній публічний запис",
    noImage: "Без публічного фото",
    identityBadges: {
      catalog: "Каталог",
      provisional: "Робоча назва",
      unknown: "Не визначено",
      unavailable: "Ідентичність недоступна",
    },
    contextKindsTitle: "Класи об'єктів",
    contextEvidenceTitle: "Об'єкти з журналами",
  },
  bg: {
    metadataTitle: "Живи обекти | OverGarden",
    metadataDescription:
      "Растения, животни и пчелни семейства с реални публични дневници и ясно означена идентичност.",
    heading: "Живи обекти",
    intro:
      "Растения, животни и пчелни семейства, за които вече има публични наблюдения.",
    kindFilterLabel: "Класове живи обекти",
    identityFilterLabel: "Ниво на идентичност",
    kinds: {
      all: "Всички",
      plant: "Растения",
      animal: "Животни",
      bee_colony: "Пчелни семейства",
    },
    identities: {
      all: "Всички идентичности",
      plant_variety: "Сортове",
      species: "Видове",
      breed: "Породи",
      bee_breed: "Породи и линии",
      provisional: "Работни имена",
      unknown: "Неопределени",
      unavailable: "Недостъпни",
    },
    searchLabel: "Търсене на живи обекти",
    searchPlaceholder: "Вид, сорт, порода или име на обект",
    searchSubmit: "Търсене",
    clearSearch: "Изчистване на търсенето",
    suggestionsLabel: "Намерени идентичности",
    suggestionsLoading: "Търсене...",
    suggestionsUnavailable: "Предложенията временно не са достъпни.",
    resultsTitle: "Публични доказателства",
    resetFilters: "Нулиране на филтрите",
    previousPage: "Предишна",
    nextPage: "Следваща",
    pageLabel: "Страница",
    emptyTitle: "Няма намерени резултати",
    emptyBody:
      "За тази комбинация още няма публични дневници. Променете филтъра или изчистете търсенето.",
    loadingLabel: "Зареждане на каталога с живи обекти",
    errorTitle: "Каталогът временно не е достъпен",
    errorBody:
      "Публичните дневници остават достъпни. Опитайте заявката към каталога отново по-късно.",
    retry: "Опитайте отново",
    openCatalog: "Отвори идентичността",
    openPassport: "Отвори паспорта",
    openJournal: "Отвори дневника",
    latestJournal: "Последен публичен запис",
    noImage: "Без публична снимка",
    identityBadges: {
      catalog: "Каталог",
      provisional: "Работно име",
      unknown: "Неопределено",
      unavailable: "Идентичността не е достъпна",
    },
    contextKindsTitle: "Класове обекти",
    contextEvidenceTitle: "Обекти с дневници",
  },
  ru: {
    metadataTitle: "Живые объекты | OverGarden",
    metadataDescription:
      "Растения, животные и пчелиные семьи с реальными публичными журналами и честно обозначенной идентичностью.",
    heading: "Живые объекты",
    intro:
      "Растения, животные и пчелиные семьи, о которых уже есть публичные наблюдения.",
    kindFilterLabel: "Классы живых объектов",
    identityFilterLabel: "Уровень идентичности",
    kinds: {
      all: "Все",
      plant: "Растения",
      animal: "Животные",
      bee_colony: "Пчелиные семьи",
    },
    identities: {
      all: "Все идентичности",
      plant_variety: "Сорта",
      species: "Виды",
      breed: "Породы",
      bee_breed: "Породы и линии",
      provisional: "Рабочие названия",
      unknown: "Не определено",
      unavailable: "Недоступные",
    },
    searchLabel: "Поиск живых объектов",
    searchPlaceholder: "Вид, сорт, порода или название объекта",
    searchSubmit: "Найти",
    clearSearch: "Очистить поиск",
    suggestionsLabel: "Найденные идентичности",
    suggestionsLoading: "Поиск...",
    suggestionsUnavailable: "Подсказки временно недоступны.",
    resultsTitle: "Публичные доказательства",
    resetFilters: "Сбросить фильтры",
    previousPage: "Предыдущая",
    nextPage: "Следующая",
    pageLabel: "Страница",
    emptyTitle: "Ничего не найдено",
    emptyBody:
      "Для этого сочетания пока нет публичных журналов. Измените фильтр или сбросьте поиск.",
    loadingLabel: "Загрузка каталога живых объектов",
    errorTitle: "Каталог временно недоступен",
    errorBody:
      "Публичные журналы остаются доступны. Повторите запрос к каталогу немного позже.",
    retry: "Повторить",
    openCatalog: "Открыть идентичность",
    openPassport: "Открыть паспорт",
    openJournal: "Открыть журнал",
    latestJournal: "Последняя публичная запись",
    noImage: "Без публичного фото",
    identityBadges: {
      catalog: "Каталог",
      provisional: "Рабочее название",
      unknown: "Не определено",
      unavailable: "Идентичность недоступна",
    },
    contextKindsTitle: "Классы объектов",
    contextEvidenceTitle: "Объекты с журналами",
  },
} satisfies Record<PublicLocale, PublicObjectCatalogCopy>;

const IDENTITY_DESCRIPTIONS: Record<
  PublicLocale,
  Record<PlantObjectKind, Record<PublicObjectCatalogIdentityState, string>>
> = {
  uk: {
    plant: {
      catalog: "Ідентичність є в публічному каталозі.",
      provisional: "Це робоча назва рослини, а не підтверджена таксономія.",
      unknown: "Вид або сорт цієї рослини ще не визначено.",
      unavailable: "Попередня каталожна ідентичність більше не доступна.",
    },
    animal: {
      catalog: "Вид або порода є в публічному каталозі.",
      provisional: "Назва доглядальника; це не підтверджена порода чи вид.",
      unknown: "Вид або породу тварини ще не підтверджено.",
      unavailable: "Попередня каталожна ідентичність тварини недоступна.",
    },
    bee_colony: {
      catalog: "Вид, порода або лінія є в публічному каталозі.",
      provisional: "Це робоча лінія сім'ї, а не підтверджена порода.",
      unknown: "Породу або лінію бджолосім'ї ще не визначено.",
      unavailable: "Попередня ідентичність сім'ї більше не доступна.",
    },
  },
  bg: {
    plant: {
      catalog: "Идентичността присъства в публичния каталог.",
      provisional:
        "Това е работно име на растение, а не потвърдена таксономия.",
      unknown: "Видът или сортът на растението още не е потвърден.",
      unavailable: "Предишната каталожна идентичност вече не е достъпна.",
    },
    animal: {
      catalog: "Видът или породата присъства в публичния каталог.",
      provisional: "Име от стопанина; видът или породата не е потвърден.",
      unknown: "Видът или породата на животното не е потвърден.",
      unavailable: "Предишната идентичност на животното не е достъпна.",
    },
    bee_colony: {
      catalog: "Видът, породата или линията присъства в публичния каталог.",
      provisional: "Това е работна линия на семейството, не потвърдена порода.",
      unknown: "Породата или линията на пчелното семейство не е потвърдена.",
      unavailable: "Предишната идентичност на семейството не е достъпна.",
    },
  },
  ru: {
    plant: {
      catalog: "Идентичность есть в публичном каталоге.",
      provisional:
        "Это рабочее название растения, а не подтверждённая таксономия.",
      unknown: "Вид или сорт растения пока не определён.",
      unavailable: "Предыдущая каталожная идентичность больше недоступна.",
    },
    animal: {
      catalog: "Вид или порода есть в публичном каталоге.",
      provisional: "Название владельца; вид или порода не подтверждены.",
      unknown: "Вид или порода животного пока не подтверждены.",
      unavailable: "Предыдущая идентичность животного недоступна.",
    },
    bee_colony: {
      catalog: "Вид, порода или линия есть в публичном каталоге.",
      provisional: "Это рабочая линия семьи, а не подтверждённая порода.",
      unknown: "Порода или линия пчелиной семьи пока не определена.",
      unavailable: "Предыдущая идентичность семьи больше недоступна.",
    },
  },
};

export function getPublicObjectCatalogCopy(
  locale: PublicLocale,
): PublicObjectCatalogCopy {
  return COPY[locale];
}

export function publicObjectCatalogIdentityDescription(
  locale: PublicLocale,
  objectKind: PlantObjectKind,
  state: PublicObjectCatalogIdentityState,
) {
  return IDENTITY_DESCRIPTIONS[locale][objectKind][state];
}
