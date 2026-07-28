import type { PlantObjectKind } from "@/db/schema";
import type { PublicLocale } from "@/lib/public-localization";
import type {
  PublicJournalDirectorySeason,
  PublicJournalDirectorySort,
} from "@/server/public-journal-directory-repository";

export interface PublicJournalDirectoryCopy {
  metadataTitle: string;
  metadataDescription: string;
  heading: string;
  intro: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchSubmit: string;
  filtersLabel: string;
  kindLabel: string;
  kinds: Record<"all" | PlantObjectKind, string>;
  catalogLabel: string;
  allCatalogs: string;
  topicLabel: string;
  allTopics: string;
  seasonLabel: string;
  seasons: Record<PublicJournalDirectorySeason, string>;
  regionLabel: string;
  allRegions: string;
  sortLabel: string;
  sorts: Record<PublicJournalDirectorySort, string>;
  applyFilters: string;
  resultsTitle: string;
  activeFiltersLabel: string;
  resetFilters: string;
  removeFilter: string;
  loadingLabel: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  errorBody: string;
  degradedSearchTitle: string;
  degradedSearchBody: string;
  retry: string;
  previousPage: string;
  loadMore: string;
  endOfResults: string;
  pageLabel: string;
  readEntry: string;
  publishedBy: string;
  safeRegion: string;
  noPublicPhoto: string;
  identityPending: string;
  contextTopicsTitle: string;
  contextCatalogsTitle: string;
}

const COPY = {
  uk: {
    metadataTitle: "Журнали | OverGarden",
    metadataDescription:
      "Публічні журнали про рослини, тварин і бджолосім'ї з безпечними фільтрами за темою, сезоном та регіоном.",
    heading: "Журнали",
    intro: "Датовані спостереження з реальним контекстом живих об'єктів.",
    searchLabel: "Пошук у публічних журналах",
    searchPlaceholder: "Проблема, догляд, об'єкт або ідентичність",
    searchSubmit: "Знайти",
    filtersLabel: "Фільтри журналів",
    kindLabel: "Живий об'єкт",
    kinds: {
      all: "Усі об'єкти",
      plant: "Рослини",
      animal: "Тварини",
    },
    catalogLabel: "Ідентичність",
    allCatalogs: "Усі ідентичності",
    topicLabel: "Тема або проблема",
    allTopics: "Усі теми",
    seasonLabel: "Сезон",
    seasons: {
      all: "Усі сезони",
      winter: "Зима",
      spring: "Весна",
      summer: "Літо",
      autumn: "Осінь",
    },
    regionLabel: "Безпечний регіон",
    allRegions: "Усі публічні регіони",
    sortLabel: "Порядок",
    sorts: {
      relevance: "За відповідністю",
      recent: "Спочатку нові",
      oldest: "Спочатку давні",
    },
    applyFilters: "Застосувати",
    resultsTitle: "Знайдені журнали",
    activeFiltersLabel: "Активні фільтри",
    resetFilters: "Скинути все",
    removeFilter: "Прибрати фільтр",
    loadingLabel: "Завантаження публічних журналів",
    emptyTitle: "Журналів не знайдено",
    emptyBody:
      "Змініть пошук або один із фільтрів, щоб побачити інші публічні спостереження.",
    errorTitle: "Журнали тимчасово недоступні",
    errorBody:
      "Запит не вдалося виконати. Параметри збережені, тому його можна безпечно повторити.",
    degradedSearchTitle: "Пошук тимчасово обмежений",
    degradedSearchBody:
      "Показуємо збіги з обмеженої добірки свіжих публічних журналів. Повторіть пошук, щоб перевірити весь індекс.",
    retry: "Спробувати ще раз",
    previousPage: "Попередня сторінка",
    loadMore: "Показати більше журналів",
    endOfResults: "Усі знайдені журнали показані",
    pageLabel: "Сторінка",
    readEntry: "Читати запис",
    publishedBy: "Автор",
    safeRegion: "Регіон",
    noPublicPhoto: "Без публічного фото",
    identityPending: "Ідентичність не підтверджено",
    contextTopicsTitle: "Теми з досвідом",
    contextCatalogsTitle: "Живі ідентичності",
  },
  bg: {
    metadataTitle: "Дневници | OverGarden",
    metadataDescription:
      "Публични дневници за растения, животни и пчелни семейства с безопасни филтри по тема, сезон и регион.",
    heading: "Дневници",
    intro: "Датирани наблюдения с реален контекст за живите обекти.",
    searchLabel: "Търсене в публичните дневници",
    searchPlaceholder: "Проблем, грижа, обект или идентичност",
    searchSubmit: "Търсене",
    filtersLabel: "Филтри на дневниците",
    kindLabel: "Жив обект",
    kinds: {
      all: "Всички обекти",
      plant: "Растения",
      animal: "Животни",
    },
    catalogLabel: "Идентичност",
    allCatalogs: "Всички идентичности",
    topicLabel: "Тема или проблем",
    allTopics: "Всички теми",
    seasonLabel: "Сезон",
    seasons: {
      all: "Всички сезони",
      winter: "Зима",
      spring: "Пролет",
      summer: "Лято",
      autumn: "Есен",
    },
    regionLabel: "Безопасен регион",
    allRegions: "Всички публични региони",
    sortLabel: "Подреждане",
    sorts: {
      relevance: "По съответствие",
      recent: "Първо новите",
      oldest: "Първо старите",
    },
    applyFilters: "Прилагане",
    resultsTitle: "Намерени дневници",
    activeFiltersLabel: "Активни филтри",
    resetFilters: "Нулиране на всичко",
    removeFilter: "Премахване на филтър",
    loadingLabel: "Зареждане на публичните дневници",
    emptyTitle: "Няма намерени дневници",
    emptyBody:
      "Променете търсенето или някой филтър, за да видите други публични наблюдения.",
    errorTitle: "Дневниците временно не са достъпни",
    errorBody:
      "Заявката не можа да бъде изпълнена. Параметрите са запазени и може безопасно да опитате отново.",
    degradedSearchTitle: "Търсенето временно е ограничено",
    degradedSearchBody:
      "Показваме съвпадения от ограничен набор скорошни публични дневници. Повторете търсенето, за да проверите целия индекс.",
    retry: "Опитайте отново",
    previousPage: "Предишна страница",
    loadMore: "Покажи още дневници",
    endOfResults: "Всички намерени дневници са показани",
    pageLabel: "Страница",
    readEntry: "Прочетете записа",
    publishedBy: "Автор",
    safeRegion: "Регион",
    noPublicPhoto: "Без публична снимка",
    identityPending: "Идентичността не е потвърдена",
    contextTopicsTitle: "Теми с опит",
    contextCatalogsTitle: "Живи идентичности",
  },
  ru: {
    metadataTitle: "Журналы | OverGarden",
    metadataDescription:
      "Публичные журналы о растениях, животных и пчелиных семьях с безопасными фильтрами по теме, сезону и региону.",
    heading: "Журналы",
    intro: "Датированные наблюдения с реальным контекстом живых объектов.",
    searchLabel: "Поиск в публичных журналах",
    searchPlaceholder: "Проблема, уход, объект или идентичность",
    searchSubmit: "Найти",
    filtersLabel: "Фильтры журналов",
    kindLabel: "Живой объект",
    kinds: {
      all: "Все объекты",
      plant: "Растения",
      animal: "Животные",
    },
    catalogLabel: "Идентичность",
    allCatalogs: "Все идентичности",
    topicLabel: "Тема или проблема",
    allTopics: "Все темы",
    seasonLabel: "Сезон",
    seasons: {
      all: "Все сезоны",
      winter: "Зима",
      spring: "Весна",
      summer: "Лето",
      autumn: "Осень",
    },
    regionLabel: "Безопасный регион",
    allRegions: "Все публичные регионы",
    sortLabel: "Порядок",
    sorts: {
      relevance: "По соответствию",
      recent: "Сначала новые",
      oldest: "Сначала старые",
    },
    applyFilters: "Применить",
    resultsTitle: "Найденные журналы",
    activeFiltersLabel: "Активные фильтры",
    resetFilters: "Сбросить всё",
    removeFilter: "Убрать фильтр",
    loadingLabel: "Загрузка публичных журналов",
    emptyTitle: "Журналы не найдены",
    emptyBody:
      "Измените поиск или один из фильтров, чтобы увидеть другие публичные наблюдения.",
    errorTitle: "Журналы временно недоступны",
    errorBody:
      "Запрос не удалось выполнить. Параметры сохранены, поэтому его можно безопасно повторить.",
    degradedSearchTitle: "Поиск временно ограничен",
    degradedSearchBody:
      "Показываем совпадения из ограниченной подборки свежих публичных журналов. Повторите поиск, чтобы проверить весь индекс.",
    retry: "Повторить",
    previousPage: "Предыдущая страница",
    loadMore: "Показать больше журналов",
    endOfResults: "Все найденные журналы показаны",
    pageLabel: "Страница",
    readEntry: "Читать запись",
    publishedBy: "Автор",
    safeRegion: "Регион",
    noPublicPhoto: "Без публичного фото",
    identityPending: "Идентичность не подтверждена",
    contextTopicsTitle: "Темы с опытом",
    contextCatalogsTitle: "Живые идентичности",
  },
} satisfies Record<PublicLocale, PublicJournalDirectoryCopy>;

export function getPublicJournalDirectoryCopy(
  locale: PublicLocale,
): PublicJournalDirectoryCopy {
  return COPY[locale];
}
