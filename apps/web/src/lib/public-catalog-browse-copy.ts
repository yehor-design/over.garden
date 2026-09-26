import type { PublicLocale } from "@/lib/public-localization";
import type {
  CatalogBrowseKingdom,
  CatalogBrowseRank,
  CatalogBrowseRegister,
  CatalogBrowseSort,
} from "@/lib/public-catalog-browse";

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
  /** The one door's own chrome (`OVE-451`). */
  readonly eyebrow: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchSubmit: string;
  readonly resultsTitle: string;
  readonly resultCount: (total: number) => string;
  readonly filtersLabel: string;
  readonly filtersWithCount: (count: number) => string;
  readonly applyFilters: string;
  readonly resetFilters: string;
  readonly activeFiltersLabel: string;
  readonly removeFilter: string;
  readonly sortLabel: string;
  readonly sorts: Readonly<Record<CatalogBrowseSort, string>>;
  readonly kingdomFacet: string;
  readonly anyKingdom: string;
  readonly rankFacet: string;
  readonly anyRank: string;
  readonly rank: Readonly<Record<CatalogBrowseRank, string>>;
  readonly registerFacet: string;
  readonly anyRegister: string;
  readonly register: Readonly<Record<CatalogBrowseRegister, string>>;
  readonly grownFacet: string;
  readonly grownAny: string;
  readonly grownOnly: string;
  readonly writtenAbout: string;
  readonly lettersHeading: string;
  readonly allLetters: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly errorTitle: string;
  readonly errorBody: string;
  readonly errorReference: string;
  readonly retry: string;
  readonly loadingLabel: string;
  /**
   * The door (`OVE-496`): finding a living thing comes before browsing a
   * register of 114 669 names, and the register is one explicit step away.
   */
  readonly doorTitle: string;
  readonly doorDescription: string;
  readonly scopeLegend: string;
  readonly scopeAll: string;
  readonly firstHandAll: (total: number) => string;
  readonly firstHandEmpty: string;
  readonly legendTitle: string;
  /** Species, form and a gardener's own object, told apart in a sentence each. */
  readonly legend: readonly { term: string; description: string }[];
  readonly allHeading: string;
  readonly allDescription: (total: number) => string;
  /** "Сорт виду «томат»": a form named by the species it belongs to. */
  readonly speciesOf: (rank: string, species: string) => string;
  /** The same search across every kingdom, when the chosen one has none. */
  readonly searchEverywhere: (total: number) => string;
  readonly doorPartial: string;
}

const UK: PublicCatalogBrowseCopy = {
  title: "Каталог організмів",
  metadataTitle: "Каталог організмів | OverGarden",
  description:
    "Рослини, тварини, гриби й інші організми, про які ведуть журнали в OverGarden — за царствами й за першою літерою назви.",
  firstHandHeading: "Про що вже писали садівники",
  firstHandDescription:
    "Організми, про які тут є хоча б один публічний запис садівника.",
  kingdomsHeading: "За царствами",
  registersHeading: "Сорти в державних реєстрах",
  organismCount: (total) => `${total.toLocaleString("uk-UA")} організмів`,
  allInitials: "Усі літери",
  backToKingdoms: "До всіх царств",
  pageOf: (page, pageCount) => `Сторінка ${page} з ${pageCount}`,
  previousPage: "Попередня сторінка",
  nextPage: "Наступна сторінка",
  emptyInitial: "На цю літеру тут поки нічого немає.",
  eyebrow: "Каталог",
  searchLabel: "Пошук у каталозі",
  searchPlaceholder: "Наприклад, Solanum lycopersicum або томат",
  searchSubmit: "Шукати",
  resultsTitle: "Організми",
  resultCount: (total) => `${total.toLocaleString("uk-UA")} організмів`,
  filtersLabel: "Фільтри каталогу",
  filtersWithCount: (count) => (count > 0 ? `Фільтри (${count})` : "Фільтри"),
  applyFilters: "Застосувати",
  resetFilters: "Скинути",
  activeFiltersLabel: "Активні фільтри",
  removeFilter: "Прибрати фільтр",
  sortLabel: "Порядок",
  sorts: { name: "За назвою", written: "Спочатку з записами" },
  kingdomFacet: "Царство",
  anyKingdom: "Усі царства",
  rankFacet: "Ранг",
  anyRank: "Усі ранги",
  rank: {
    species: "Вид",
    cultivar: "Сорт",
    subspecies: "Підвид",
    variety: "Різновид",
    breed: "Порода",
  },
  registerFacet: "Реєстр",
  anyRegister: "Будь-який",
  register: { ua: "Реєстр України", eu: "Реєстр ЄС" },
  grownFacet: "Записи садівників",
  grownAny: "Усі організми",
  grownOnly: "Лише ті, про які писали",
  writtenAbout: "Є записи садівників",
  lettersHeading: "За літерою",
  allLetters: "Усі літери",
  emptyTitle: "За цим запитом у каталозі нічого немає.",
  emptyBody: "Приберіть частину фільтрів або спробуйте іншу назву.",
  errorTitle: "Каталог зараз недоступний",
  errorBody: "Спробуйте оновити сторінку за хвилину.",
  errorReference: "Код звернення:",
  retry: "Спробувати ще раз",
  loadingLabel: "Завантажуємо каталог",
  doorTitle: "Знайдіть рослину чи тварину",
  doorDescription:
    "За звичною чи науковою назвою — томат або Solanum lycopersicum. Кожна картка каже, що це за організм і чи писали про нього садівники.",
  scopeLegend: "Що шукаєте",
  scopeAll: "Усе",
  firstHandAll: (total) =>
    `Усі, про які писали: ${total.toLocaleString("uk-UA")}`,
  firstHandEmpty: "Поки ніхто тут не писав про жоден організм із каталогу.",
  legendTitle: "Вид, сорт і ваша рослина",
  legend: [
    {
      term: "Вид",
      description:
        "Організм, як його знає наука: томат — це вид Solanum lycopersicum.",
    },
    {
      term: "Сорт або порода",
      description:
        "Форма виду, виведена людьми: «Де Барао» — сорт томата. Картка сорту чи породи називає свій вид.",
    },
    {
      term: "Ваша рослина чи тварина",
      description:
        "Окремий запис у вашому саду. Її можна прив'язати до виду, сорту чи породи — а можна й ні.",
    },
  ],
  allHeading: "Увесь каталог",
  allDescription: (total) =>
    `${total.toLocaleString("uk-UA")} організмів — за царствами й за першою літерою латинської назви.`,
  speciesOf: (rank, species) => `${rank} виду «${species}»`,
  searchEverywhere: (total) =>
    `Шукати в усьому каталозі (${total.toLocaleString("uk-UA")})`,
  doorPartial: "Частину каталогу зараз не вдалося показати. Пошук працює.",
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
    "Организми, за които тук има поне един публичен запис на градинар.",
  kingdomsHeading: "По царства",
  registersHeading: "Сортове в държавните регистри",
  organismCount: (total) => `${total.toLocaleString("bg-BG")} организма`,
  allInitials: "Всички букви",
  backToKingdoms: "Към всички царства",
  pageOf: (page, pageCount) => `Страница ${page} от ${pageCount}`,
  previousPage: "Предишна страница",
  nextPage: "Следваща страница",
  emptyInitial: "За тази буква още няма нищо тук.",
  eyebrow: "Каталог",
  searchLabel: "Търсене в каталога",
  searchPlaceholder: "Например Solanum lycopersicum или домат",
  searchSubmit: "Търсене",
  resultsTitle: "Организми",
  resultCount: (total) => `${total.toLocaleString("bg-BG")} организма`,
  filtersLabel: "Филтри на каталога",
  filtersWithCount: (count) => (count > 0 ? `Филтри (${count})` : "Филтри"),
  applyFilters: "Приложи",
  resetFilters: "Изчисти",
  activeFiltersLabel: "Активни филтри",
  removeFilter: "Премахни филтъра",
  sortLabel: "Подредба",
  sorts: { name: "По име", written: "Първо със записи" },
  kingdomFacet: "Царство",
  anyKingdom: "Всички царства",
  rankFacet: "Ранг",
  anyRank: "Всички рангове",
  rank: {
    species: "Вид",
    cultivar: "Сорт",
    subspecies: "Подвид",
    variety: "Разновидност",
    breed: "Порода",
  },
  registerFacet: "Регистър",
  anyRegister: "Всеки",
  register: { ua: "Регистър на Украйна", eu: "Регистър на ЕС" },
  grownFacet: "Записи на градинари",
  grownAny: "Всички организми",
  grownOnly: "Само тези със записи",
  writtenAbout: "Има записи на градинари",
  lettersHeading: "По буква",
  allLetters: "Всички букви",
  emptyTitle: "По това търсене каталогът няма нищо.",
  emptyBody: "Премахнете част от филтрите или опитайте друго име.",
  errorTitle: "Каталогът не е достъпен в момента",
  errorBody: "Опитайте да презаредите страницата след минута.",
  errorReference: "Код на обръщението:",
  retry: "Опитайте отново",
  loadingLabel: "Зареждаме каталога",
  doorTitle: "Намерете растение или животно",
  doorDescription:
    "По обичайното или научното име — домат или Solanum lycopersicum. Всяка карта казва какъв е организмът и дали градинарите са писали за него.",
  scopeLegend: "Какво търсите",
  scopeAll: "Всичко",
  firstHandAll: (total) =>
    `Всички, за които са писали: ${total.toLocaleString("bg-BG")}`,
  firstHandEmpty: "Засега никой тук не е писал за организъм от каталога.",
  legendTitle: "Вид, сорт и вашето растение",
  legend: [
    {
      term: "Вид",
      description:
        "Организмът, както го познава науката: доматът е видът Solanum lycopersicum.",
    },
    {
      term: "Сорт или порода",
      description:
        "Форма на вида, създадена от хората: „Де Барао“ е сорт домат. Картата на сорта или породата назовава своя вид.",
    },
    {
      term: "Вашето растение или животно",
      description:
        "Отделен запис във вашата градина. Може да го свържете с вид, сорт или порода — или не.",
    },
  ],
  allHeading: "Целият каталог",
  allDescription: (total) =>
    `${total.toLocaleString("bg-BG")} организма — по царства и по първа буква на латинското име.`,
  speciesOf: (rank, species) => `${rank} на вида „${species}“`,
  searchEverywhere: (total) =>
    `Търсене в целия каталог (${total.toLocaleString("bg-BG")})`,
  doorPartial: "Част от каталога не можа да се покаже сега. Търсенето работи.",
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
    "Организмы, о которых здесь есть хотя бы одна публичная запись садовода.",
  kingdomsHeading: "По царствам",
  registersHeading: "Сорта в государственных реестрах",
  organismCount: (total) => `${total.toLocaleString("ru-RU")} организмов`,
  allInitials: "Все буквы",
  backToKingdoms: "Ко всем царствам",
  pageOf: (page, pageCount) => `Страница ${page} из ${pageCount}`,
  previousPage: "Предыдущая страница",
  nextPage: "Следующая страница",
  emptyInitial: "На эту букву здесь пока ничего нет.",
  eyebrow: "Каталог",
  searchLabel: "Поиск по каталогу",
  searchPlaceholder: "Например Solanum lycopersicum или томат",
  searchSubmit: "Искать",
  resultsTitle: "Организмы",
  resultCount: (total) => `${total.toLocaleString("ru-RU")} организмов`,
  filtersLabel: "Фильтры каталога",
  filtersWithCount: (count) => (count > 0 ? `Фильтры (${count})` : "Фильтры"),
  applyFilters: "Применить",
  resetFilters: "Сбросить",
  activeFiltersLabel: "Активные фильтры",
  removeFilter: "Убрать фильтр",
  sortLabel: "Порядок",
  sorts: { name: "По названию", written: "Сначала с записями" },
  kingdomFacet: "Царство",
  anyKingdom: "Все царства",
  rankFacet: "Ранг",
  anyRank: "Все ранги",
  rank: {
    species: "Вид",
    cultivar: "Сорт",
    subspecies: "Подвид",
    variety: "Разновидность",
    breed: "Порода",
  },
  registerFacet: "Реестр",
  anyRegister: "Любой",
  register: { ua: "Реестр Украины", eu: "Реестр ЕС" },
  grownFacet: "Записи садоводов",
  grownAny: "Все организмы",
  grownOnly: "Только те, о которых писали",
  writtenAbout: "Есть записи садоводов",
  lettersHeading: "По букве",
  allLetters: "Все буквы",
  emptyTitle: "По этому запросу в каталоге ничего нет.",
  emptyBody: "Уберите часть фильтров или попробуйте другое название.",
  errorTitle: "Каталог сейчас недоступен",
  errorBody: "Попробуйте обновить страницу через минуту.",
  errorReference: "Код обращения:",
  retry: "Попробовать ещё раз",
  loadingLabel: "Загружаем каталог",
  doorTitle: "Найдите растение или животное",
  doorDescription:
    "По привычному или научному названию — томат или Solanum lycopersicum. Каждая карточка говорит, что это за организм и писали ли о нём садоводы.",
  scopeLegend: "Что ищете",
  scopeAll: "Всё",
  firstHandAll: (total) =>
    `Все, о которых писали: ${total.toLocaleString("ru-RU")}`,
  firstHandEmpty:
    "Пока никто здесь не писал ни об одном организме из каталога.",
  legendTitle: "Вид, сорт и ваше растение",
  legend: [
    {
      term: "Вид",
      description:
        "Организм, как его знает наука: томат — это вид Solanum lycopersicum.",
    },
    {
      term: "Сорт или порода",
      description:
        "Форма вида, выведенная людьми: «Де Барао» — сорт томата. Карточка сорта или породы называет свой вид.",
    },
    {
      term: "Ваше растение или животное",
      description:
        "Отдельная запись в вашем саду. Её можно привязать к виду, сорту или породе — а можно и нет.",
    },
  ],
  allHeading: "Весь каталог",
  allDescription: (total) =>
    `${total.toLocaleString("ru-RU")} организмов — по царствам и по первой букве латинского названия.`,
  speciesOf: (rank, species) => `${rank} вида «${species}»`,
  searchEverywhere: (total) =>
    `Искать во всём каталоге (${total.toLocaleString("ru-RU")})`,
  doorPartial: "Часть каталога сейчас не удалось показать. Поиск работает.",
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
