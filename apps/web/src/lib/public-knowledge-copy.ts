import type { PublicLocale } from "@/lib/public-localization";

export type PublicKnowledgeCopySubject = "gardening" | "product";
export type PublicKnowledgeCopyFormat = "guide" | "answer" | "topic";

export interface PublicKnowledgeCopy {
  metadataTitle: string;
  metadataDescription: string;
  heading: string;
  intro: string;
  filtersLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  typeLabel: string;
  kindLabel: string;
  applyFilters: string;
  resetFilters: string;
  resultsTitle: string;
  guidesTitle: string;
  answersTitle: string;
  topicsTitle: string;
  /**
   * What a piece is about, before what shape it has (`OVE-498`): gardening
   * advice owes its sources, help with OverGarden only has to be true of it.
   */
  subjects: Record<PublicKnowledgeCopySubject, string>;
  /** One piece's shape, in the singular: "Відповідь", "Посібник", "Тема". */
  formats: Record<PublicKnowledgeCopyFormat, string>;
  journalEvidenceLabel: string;
  evidenceCountOne: string;
  evidenceCountFew: string;
  evidenceCount: string;
  /** "Усі записи (9)": where the gardeners' entries continue. */
  viewAllEvidence: (count: string) => string;
  /**
   * Said beside gardeners' entries under a text: they are what gardeners saw,
   * not a check of what the text says.
   */
  evidenceNote: string;
  bylineLabel: string;
  updatedLabel: string;
  /** "Про цей текст": who wrote it, on what, and what it is not. */
  aboutTitle: string;
  /** The byline's pointer to that section, with how many sources it lists. */
  aboutLink: (sourceCount: number) => string;
  subjectLabel: string;
  basisLabel: string;
  sourcesLabel: string;
  /** How many sources a text cites, for the hub and the byline. */
  sourcesCount: (count: number) => string;
  noSources: string;
  sourcePublished: (date: string) => string;
  sourceUpdated: (date: string) => string;
  sourceAccessed: (date: string) => string;
  /** A citation's accessible name: "Джерело 1". */
  citationLabel: (number: number) => string;
  qualificationsLabel: string;
  reviewLabel: string;
  reviewNone: string;
  reviewedBy: (reviewer: string, date: string) => string;
  /** The one related-content section under a text. */
  relatedTitle: string;
  /** Under a topic: the answers and guides that draw on it. */
  topicRelatedTitle: string;
  backToKnowledge: string;
  whyMatched: string;
  matchedByTopic: string;
  matchedByCatalog: string;
  readEntry: string;
  viewObject: string;
  emptyTitle: string;
  emptyBody: string;
  emptyEvidenceTitle: string;
  emptyEvidenceBody: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  /** Only the topics failed to load; answers and guides are shown. */
  topicsUnavailableTitle: string;
  retry: string;
  unavailableTitle: string;
  unavailableBody: string;
  publicTopicLabel: string;
  /** A topic's recency: "останній запис 12 вер. 2026 р.". */
  topicLatest: (date: string) => string;
  /** A topic's own search, which reads the journals it holds. */
  topicSearchLabel: (topic: string) => string;
  topicSearchPlaceholder: string;
  topicSearchSubmit: string;
  topicEvidenceTitle: string;
  filters: {
    types: Record<"all" | "guide" | "answer" | "topic", string>;
    kinds: Record<"all" | "plant" | "animal", string>;
  };
}

const COPY = {
  uk: {
    metadataTitle: "Знання | OverGarden",
    metadataDescription:
      "Відповіді на садівничі питання з джерелами, теми із записами садівників і довідка про те, як працює OverGarden.",
    heading: "Знання",
    intro:
      "Відповіді на садівничі питання з джерелами, теми із записами садівників і довідка про те, як працює OverGarden.",
    filtersLabel: "Фільтри знань",
    searchLabel: "Пошук у знаннях",
    searchPlaceholder: "Питання, рослина або тема",
    typeLabel: "Формат",
    kindLabel: "Живий об'єкт",
    applyFilters: "Шукати",
    resetFilters: "Скинути все",
    resultsTitle: "Знайдено",
    guidesTitle: "Посібники",
    answersTitle: "Відповіді",
    topicsTitle: "Теми",
    subjects: {
      gardening: "Садівництво",
      product: "Довідка OverGarden",
    },
    formats: { guide: "Посібник", answer: "Відповідь", topic: "Тема" },
    journalEvidenceLabel: "Записи садівників",
    evidenceCountOne: "запис садівника",
    evidenceCountFew: "записи садівників",
    evidenceCount: "записів садівників",
    viewAllEvidence: (count) => `Усі записи (${count})`,
    evidenceNote:
      "Це власні спостереження садівників: вони не підтверджують і не спростовують текст вище.",
    bylineLabel: "Автор",
    updatedLabel: "Оновлено",
    aboutTitle: "Про цей текст",
    aboutLink: (sourceCount) =>
      sourceCount > 0
        ? `${sourceCountUk(sourceCount)} й обмеження`
        : "Основа й обмеження",
    subjectLabel: "Про що",
    basisLabel: "На чому ґрунтується",
    sourcesLabel: "Джерела",
    sourcesCount: sourceCountUk,
    noSources: "Зовнішніх джерел немає: текст описує сам OverGarden.",
    sourcePublished: (date) => `опубліковано ${date}`,
    sourceUpdated: (date) => `оновлено ${date}`,
    sourceAccessed: (date) => `переглянуто ${date}`,
    citationLabel: (number) => `Джерело ${number}`,
    qualificationsLabel: "Обмеження",
    reviewLabel: "Перевірка фахівцем",
    reviewNone: "Агроном чи фахівець із захисту рослин цей текст не перевіряв.",
    reviewedBy: (reviewer, date) => `${reviewer}, ${date}`,
    relatedTitle: "Читайте також",
    topicRelatedTitle: "Відповіді й посібники на цю тему",
    backToKnowledge: "До знань",
    whyMatched: "Чому це пов'язано",
    matchedByTopic: "Спільна тема",
    matchedByCatalog: "Спільна ідентичність",
    readEntry: "Читати запис",
    viewObject: "Відкрити живий об'єкт",
    emptyTitle: "Матеріалів не знайдено",
    emptyBody: "Змініть запит або фільтри, щоб побачити інші матеріали.",
    emptyEvidenceTitle: "Записів садівників тут поки немає",
    emptyEvidenceBody:
      "Щойно хтось опублікує запис на цю тему, він з'явиться тут. Ми не підставляємо вигаданих прикладів.",
    loadingLabel: "Завантаження знань",
    errorTitle: "Знання тимчасово недоступні",
    errorBody: "Запит не вдалося виконати. Його можна безпечно повторити.",
    topicsUnavailableTitle: "Теми тимчасово недоступні",
    retry: "Спробувати ще раз",
    unavailableTitle: "Матеріал недоступний",
    unavailableBody: "Цей матеріал не опублікований або більше не доступний.",
    publicTopicLabel: "Тема",
    topicLatest: (date) => `останній запис ${date}`,
    topicSearchLabel: (topic) => `Пошук у записах теми «${topic}»`,
    topicSearchPlaceholder: "Слово із запису",
    topicSearchSubmit: "Шукати",
    topicEvidenceTitle: "Записи садівників",
    filters: {
      types: {
        all: "Усі формати",
        guide: "Посібники",
        answer: "Відповіді",
        topic: "Теми",
      },
      kinds: {
        all: "Усі об'єкти",
        plant: "Рослини",
        animal: "Тварини",
      },
    },
  },
  bg: {
    metadataTitle: "Знания | OverGarden",
    metadataDescription:
      "Отговори на градинарски въпроси с източници, теми със записи на градинари и помощ за това как работи OverGarden.",
    heading: "Знания",
    intro:
      "Отговори на градинарски въпроси с източници, теми със записи на градинари и помощ за това как работи OverGarden.",
    filtersLabel: "Филтри на знанията",
    searchLabel: "Търсене в знанията",
    searchPlaceholder: "Въпрос, растение или тема",
    typeLabel: "Формат",
    kindLabel: "Жив обект",
    applyFilters: "Търсене",
    resetFilters: "Нулиране",
    resultsTitle: "Намерени",
    guidesTitle: "Ръководства",
    answersTitle: "Отговори",
    topicsTitle: "Теми",
    subjects: {
      gardening: "Градинарство",
      product: "Помощ за OverGarden",
    },
    formats: { guide: "Ръководство", answer: "Отговор", topic: "Тема" },
    journalEvidenceLabel: "Записи на градинари",
    evidenceCountOne: "запис на градинар",
    evidenceCountFew: "записа на градинари",
    evidenceCount: "записа на градинари",
    viewAllEvidence: (count) => `Всички записи (${count})`,
    evidenceNote:
      "Това са собствени наблюдения на градинари: те не потвърждават и не опровергават текста по-горе.",
    bylineLabel: "Автор",
    updatedLabel: "Обновено",
    aboutTitle: "За този текст",
    aboutLink: (sourceCount) =>
      sourceCount > 0
        ? `${sourceCount} ${sourceCount === 1 ? "източник" : "източника"} и ограничения`
        : "Основа и ограничения",
    subjectLabel: "За какво",
    basisLabel: "На какво се основава",
    sourcesLabel: "Източници",
    sourcesCount: (count) =>
      `${count} ${count === 1 ? "източник" : "източника"}`,
    noSources: "Няма външни източници: текстът описва самия OverGarden.",
    sourcePublished: (date) => `публикувано ${date}`,
    sourceUpdated: (date) => `обновено ${date}`,
    sourceAccessed: (date) => `прегледано ${date}`,
    citationLabel: (number) => `Източник ${number}`,
    qualificationsLabel: "Ограничения",
    reviewLabel: "Проверка от специалист",
    reviewNone:
      "Агроном или специалист по растителна защита не е проверявал този текст.",
    reviewedBy: (reviewer, date) => `${reviewer}, ${date}`,
    relatedTitle: "Прочетете също",
    topicRelatedTitle: "Отговори и ръководства по темата",
    backToKnowledge: "Към знанията",
    whyMatched: "Защо е свързано",
    matchedByTopic: "Обща тема",
    matchedByCatalog: "Обща идентичност",
    readEntry: "Прочетете записа",
    viewObject: "Отворете живия обект",
    emptyTitle: "Няма намерени материали",
    emptyBody: "Променете заявката или филтрите, за да видите други материали.",
    emptyEvidenceTitle: "Тук все още няма записи на градинари",
    emptyEvidenceBody:
      "Щом някой публикува запис по темата, той ще се появи тук. Не поставяме измислени примери.",
    loadingLabel: "Зареждане на знания",
    errorTitle: "Знанията временно не са достъпни",
    errorBody:
      "Заявката не можа да бъде изпълнена и може безопасно да се повтори.",
    topicsUnavailableTitle: "Темите временно не са достъпни",
    retry: "Опитайте отново",
    unavailableTitle: "Материалът е недостъпен",
    unavailableBody: "Този материал не е публикуван или вече не е достъпен.",
    publicTopicLabel: "Тема",
    topicLatest: (date) => `последен запис ${date}`,
    topicSearchLabel: (topic) => `Търсене в записите по темата „${topic}“`,
    topicSearchPlaceholder: "Дума от запис",
    topicSearchSubmit: "Търсене",
    topicEvidenceTitle: "Записи на градинари",
    filters: {
      types: {
        all: "Всички формати",
        guide: "Ръководства",
        answer: "Отговори",
        topic: "Теми",
      },
      kinds: {
        all: "Всички обекти",
        plant: "Растения",
        animal: "Животни",
      },
    },
  },
  ru: {
    metadataTitle: "Знания | OverGarden",
    metadataDescription:
      "Ответы на садовые вопросы с источниками, темы с записями садоводов и справка о том, как работает OverGarden.",
    heading: "Знания",
    intro:
      "Ответы на садовые вопросы с источниками, темы с записями садоводов и справка о том, как работает OverGarden.",
    filtersLabel: "Фильтры знаний",
    searchLabel: "Поиск в знаниях",
    searchPlaceholder: "Вопрос, растение или тема",
    typeLabel: "Формат",
    kindLabel: "Живой объект",
    applyFilters: "Искать",
    resetFilters: "Сбросить",
    resultsTitle: "Найдено",
    guidesTitle: "Руководства",
    answersTitle: "Ответы",
    topicsTitle: "Темы",
    subjects: {
      gardening: "Садоводство",
      product: "Справка OverGarden",
    },
    formats: { guide: "Руководство", answer: "Ответ", topic: "Тема" },
    journalEvidenceLabel: "Записи садоводов",
    evidenceCountOne: "запись садовода",
    evidenceCountFew: "записи садоводов",
    evidenceCount: "записей садоводов",
    viewAllEvidence: (count) => `Все записи (${count})`,
    evidenceNote:
      "Это собственные наблюдения садоводов: они не подтверждают и не опровергают текст выше.",
    bylineLabel: "Автор",
    updatedLabel: "Обновлено",
    aboutTitle: "Об этом тексте",
    aboutLink: (sourceCount) =>
      sourceCount > 0
        ? `${sourceCountRu(sourceCount)} и ограничения`
        : "Основа и ограничения",
    subjectLabel: "О чём",
    basisLabel: "На чём основан",
    sourcesLabel: "Источники",
    sourcesCount: sourceCountRu,
    noSources: "Внешних источников нет: текст описывает сам OverGarden.",
    sourcePublished: (date) => `опубликовано ${date}`,
    sourceUpdated: (date) => `обновлено ${date}`,
    sourceAccessed: (date) => `просмотрено ${date}`,
    citationLabel: (number) => `Источник ${number}`,
    qualificationsLabel: "Ограничения",
    reviewLabel: "Проверка специалистом",
    reviewNone:
      "Агроном или специалист по защите растений этот текст не проверял.",
    reviewedBy: (reviewer, date) => `${reviewer}, ${date}`,
    relatedTitle: "Читайте также",
    topicRelatedTitle: "Ответы и руководства по теме",
    backToKnowledge: "К знаниям",
    whyMatched: "Почему это связано",
    matchedByTopic: "Общая тема",
    matchedByCatalog: "Общая идентичность",
    readEntry: "Читать запись",
    viewObject: "Открыть живой объект",
    emptyTitle: "Материалы не найдены",
    emptyBody: "Измените запрос или фильтры, чтобы увидеть другие материалы.",
    emptyEvidenceTitle: "Записей садоводов здесь пока нет",
    emptyEvidenceBody:
      "Как только кто-нибудь опубликует запись по теме, она появится здесь. Мы не подставляем вымышленных примеров.",
    loadingLabel: "Загрузка знаний",
    errorTitle: "Знания временно недоступны",
    errorBody: "Запрос не удалось выполнить. Его можно безопасно повторить.",
    topicsUnavailableTitle: "Темы временно недоступны",
    retry: "Повторить",
    unavailableTitle: "Материал недоступен",
    unavailableBody: "Этот материал не опубликован или больше недоступен.",
    publicTopicLabel: "Тема",
    topicLatest: (date) => `последняя запись ${date}`,
    topicSearchLabel: (topic) => `Поиск в записях темы «${topic}»`,
    topicSearchPlaceholder: "Слово из записи",
    topicSearchSubmit: "Искать",
    topicEvidenceTitle: "Записи садоводов",
    filters: {
      types: {
        all: "Все форматы",
        guide: "Руководства",
        answer: "Ответы",
        topic: "Темы",
      },
      kinds: {
        all: "Все объекты",
        plant: "Растения",
        animal: "Животные",
      },
    },
  },
} satisfies Record<PublicLocale, PublicKnowledgeCopy>;

export function getPublicKnowledgeCopy(
  locale: PublicLocale,
): PublicKnowledgeCopy {
  return COPY[locale];
}

export function formatPublicKnowledgeEvidenceCount(
  count: number,
  locale: PublicLocale,
  copy: PublicKnowledgeCopy = getPublicKnowledgeCopy(locale),
) {
  const category = new Intl.PluralRules(localeTag(locale)).select(count);
  const label =
    category === "one"
      ? copy.evidenceCountOne
      : category === "few"
        ? copy.evidenceCountFew
        : copy.evidenceCount;
  return `${new Intl.NumberFormat(localeTag(locale)).format(count)} ${label}`;
}

function sourceCountUk(count: number) {
  return `${count} ${pluralUk(count, "джерело", "джерела", "джерел")}`;
}

function sourceCountRu(count: number) {
  return `${count} ${pluralRu(count, "источник", "источника", "источников")}`;
}

function pluralUk(count: number, one: string, few: string, many: string) {
  const category = new Intl.PluralRules("uk-UA").select(count);
  return category === "one" ? one : category === "few" ? few : many;
}

function pluralRu(count: number, one: string, few: string, many: string) {
  const category = new Intl.PluralRules("ru-RU").select(count);
  return category === "one" ? one : category === "few" ? few : many;
}

function localeTag(locale: PublicLocale) {
  return { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale];
}
