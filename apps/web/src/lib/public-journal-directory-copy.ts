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
  /** "Фільтри (3)" below `lg`, and "Фільтри" when nothing is set. */
  filtersWithCount: (count: number) => string;
  resultsTitle: string;
  /** "18 записів" — pluralised here, because `FilterBar` carries no locale. */
  resultCount: (count: number) => string;
  activeFiltersLabel: string;
  resetFilters: string;
  removeFilter: string;
  loadingLabel: string;
  emptyTitle: string;
  emptyBody: string;
  firstRunTitle: string;
  firstRunBody: string;
  firstRunAction: string;
  errorTitle: string;
  errorBody: string;
  errorReference: string;
  degradedSearchTitle: string;
  degradedSearchBody: string;
  retry: string;
  paginationLabel: string;
  previousPage: string;
  loadMore: string;
  pageLabel: string;
  discuss: string;
  publishedBy: string;
  safeRegion: string;
  identityPending: string;
  contextTopicsTitle: string;
  contextCatalogsTitle: string;
}

/**
 * Ukrainian and Russian pick one of three forms by the last digits of the
 * count. Bulgarian does not — it takes a plain singular/plural — so it is
 * written inline in its own block rather than pretending to share this.
 */
function slavicPlural(count: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const COPY = {
  uk: {
    metadataTitle: "Журнали | OverGarden",
    metadataDescription:
      "Публічні журнали про рослини, тварин і бджолосім'ї з безпечними фільтрами за темою, сезоном та регіоном.",
    heading: "Журнали",
    intro:
      "Окремі датовані записи з публічних журналів. Уся історія рослини чи тварини — на її сторінці.",
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
    filtersWithCount: (count) => (count > 0 ? `Фільтри (${count})` : "Фільтри"),
    resultsTitle: "Знайдені записи",
    resultCount: (count) =>
      `${count} ${slavicPlural(count, "запис", "записи", "записів")}`,
    activeFiltersLabel: "Активні фільтри",
    resetFilters: "Скинути все",
    removeFilter: "Прибрати фільтр",
    loadingLabel: "Завантаження публічних журналів",
    emptyTitle: "Записів не знайдено",
    emptyBody:
      "Змініть пошук або один із фільтрів, щоб побачити інші публічні спостереження.",
    firstRunTitle: "Публічних журналів ще немає",
    firstRunBody:
      "Перший опублікований запис з'явиться тут і стане доступним у пошуку.",
    firstRunAction: "Як почати живий журнал",
    errorTitle: "Журнали тимчасово недоступні",
    errorBody:
      "Запит не вдалося виконати. Параметри збережені, тому його можна безпечно повторити.",
    errorReference: "Код звернення:",
    degradedSearchTitle: "Пошук тимчасово обмежений",
    degradedSearchBody:
      "Показуємо збіги з обмеженої добірки свіжих публічних журналів. Повторіть пошук, щоб перевірити весь індекс.",
    retry: "Спробувати ще раз",
    paginationLabel: "Сторінки журналів",
    previousPage: "Попередня сторінка",
    loadMore: "Показати більше журналів",
    pageLabel: "Сторінка",
    discuss: "Обговорення",
    publishedBy: "Автор",
    safeRegion: "Регіон",
    identityPending: "Ідентичність не підтверджено",
    contextTopicsTitle: "Теми з досвідом",
    contextCatalogsTitle: "Живі ідентичності",
  },
  bg: {
    metadataTitle: "Дневници | OverGarden",
    metadataDescription:
      "Публични дневници за растения, животни и пчелни семейства с безопасни филтри по тема, сезон и регион.",
    heading: "Дневници",
    intro:
      "Отделни датирани записи от публичните дневници. Цялата история на растение или животно е на неговата страница.",
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
    filtersWithCount: (count) => (count > 0 ? `Филтри (${count})` : "Филтри"),
    resultsTitle: "Намерени записи",
    resultCount: (count) => `${count} ${count === 1 ? "запис" : "записа"}`,
    activeFiltersLabel: "Активни филтри",
    resetFilters: "Нулиране на всичко",
    removeFilter: "Премахване на филтър",
    loadingLabel: "Зареждане на публичните дневници",
    emptyTitle: "Няма намерени записи",
    emptyBody:
      "Променете търсенето или някой филтър, за да видите други публични наблюдения.",
    firstRunTitle: "Още няма публични дневници",
    firstRunBody:
      "Първият публикуван запис ще се появи тук и ще стане намираем.",
    firstRunAction: "Как да започнете жив дневник",
    errorTitle: "Дневниците временно не са достъпни",
    errorBody:
      "Заявката не можа да бъде изпълнена. Параметрите са запазени и може безопасно да опитате отново.",
    errorReference: "Код за справка:",
    degradedSearchTitle: "Търсенето временно е ограничено",
    degradedSearchBody:
      "Показваме съвпадения от ограничен набор скорошни публични дневници. Повторете търсенето, за да проверите целия индекс.",
    retry: "Опитайте отново",
    paginationLabel: "Страници на дневниците",
    previousPage: "Предишна страница",
    loadMore: "Покажи още дневници",
    pageLabel: "Страница",
    discuss: "Обсъждане",
    publishedBy: "Автор",
    safeRegion: "Регион",
    identityPending: "Идентичността не е потвърдена",
    contextTopicsTitle: "Теми с опит",
    contextCatalogsTitle: "Живи идентичности",
  },
  ru: {
    metadataTitle: "Журналы | OverGarden",
    metadataDescription:
      "Публичные журналы о растениях, животных и пчелиных семьях с безопасными фильтрами по теме, сезону и региону.",
    heading: "Журналы",
    intro:
      "Отдельные датированные записи из публичных журналов. Вся история растения или животного — на его странице.",
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
    filtersWithCount: (count) => (count > 0 ? `Фильтры (${count})` : "Фильтры"),
    resultsTitle: "Найденные записи",
    resultCount: (count) =>
      `${count} ${slavicPlural(count, "запись", "записи", "записей")}`,
    activeFiltersLabel: "Активные фильтры",
    resetFilters: "Сбросить всё",
    removeFilter: "Убрать фильтр",
    loadingLabel: "Загрузка публичных журналов",
    emptyTitle: "Записи не найдены",
    emptyBody:
      "Измените поиск или один из фильтров, чтобы увидеть другие публичные наблюдения.",
    firstRunTitle: "Публичных журналов пока нет",
    firstRunBody:
      "Первая опубликованная запись появится здесь и станет доступной в поиске.",
    firstRunAction: "Как начать живой журнал",
    errorTitle: "Журналы временно недоступны",
    errorBody:
      "Запрос не удалось выполнить. Параметры сохранены, поэтому его можно безопасно повторить.",
    errorReference: "Код обращения:",
    degradedSearchTitle: "Поиск временно ограничен",
    degradedSearchBody:
      "Показываем совпадения из ограниченной подборки свежих публичных журналов. Повторите поиск, чтобы проверить весь индекс.",
    retry: "Повторить",
    paginationLabel: "Страницы журналов",
    previousPage: "Предыдущая страница",
    loadMore: "Показать больше журналов",
    pageLabel: "Страница",
    discuss: "Обсуждение",
    publishedBy: "Автор",
    safeRegion: "Регион",
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
