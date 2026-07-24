import type { PublicLocale } from "@/lib/public-localization";

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
  editorialLabel: string;
  journalEvidenceLabel: string;
  readGuide: string;
  readAnswer: string;
  exploreTopic: string;
  evidenceCountOne: string;
  evidenceCountFew: string;
  evidenceCount: string;
  bylineLabel: string;
  sourceLabel: string;
  updatedLabel: string;
  backToKnowledge: string;
  whyMatched: string;
  matchedByTopic: string;
  matchedByCatalog: string;
  readEntry: string;
  viewObject: string;
  viewAllEvidence: string;
  emptyTitle: string;
  emptyBody: string;
  emptyEvidenceTitle: string;
  emptyEvidenceBody: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  unavailableTitle: string;
  unavailableBody: string;
  publicTopicLabel: string;
  topicIndexable: string;
  topicNoindex: string;
  filters: {
    types: Record<"all" | "guide" | "answer" | "topic", string>;
    kinds: Record<"all" | "plant" | "animal", string>;
  };
}

const COPY = {
  uk: {
    metadataTitle: "Знання | OverGarden",
    metadataDescription:
      "Авторські гайди, короткі відповіді та перевірені теми, пов'язані з реальними публічними журналами живих об'єктів.",
    heading: "Знання",
    intro:
      "Знайдіть орієнтир, а потім перевірте його на датованому досвіді реальних живих об'єктів.",
    filtersLabel: "Фільтри знань",
    searchLabel: "Пошук у знаннях",
    searchPlaceholder: "Питання, задача, об'єкт або тема",
    typeLabel: "Формат",
    kindLabel: "Живий об'єкт",
    applyFilters: "Застосувати",
    resetFilters: "Скинути все",
    resultsTitle: "Знайдено",
    guidesTitle: "Практичні гайди",
    answersTitle: "Короткі відповіді",
    topicsTitle: "Теми з реальним досвідом",
    editorialLabel: "Авторський матеріал",
    journalEvidenceLabel: "Досвід із публічних журналів",
    readGuide: "Відкрити гайд",
    readAnswer: "Прочитати відповідь",
    exploreTopic: "Переглянути тему",
    evidenceCountOne: "публічний запис",
    evidenceCountFew: "публічні записи",
    evidenceCount: "публічних записів",
    bylineLabel: "Автор",
    sourceLabel: "Основа матеріалу",
    updatedLabel: "Оновлено",
    backToKnowledge: "До знань",
    whyMatched: "Чому це пов'язано",
    matchedByTopic: "Спільна тема",
    matchedByCatalog: "Спільна ідентичність",
    readEntry: "Читати запис",
    viewObject: "Відкрити живий об'єкт",
    viewAllEvidence: "Відкрити пов'язані журнали",
    emptyTitle: "Матеріалів не знайдено",
    emptyBody: "Змініть запит або фільтри, щоб побачити інші шляхи.",
    emptyEvidenceTitle: "Публічних доказів поки немає",
    emptyEvidenceBody:
      "Матеріал залишається авторським орієнтиром. Ми не підміняємо відсутній досвід вигаданими записами.",
    loadingLabel: "Завантаження знань",
    errorTitle: "Знання тимчасово недоступні",
    errorBody: "Запит не вдалося виконати. Його можна безпечно повторити.",
    retry: "Спробувати ще раз",
    unavailableTitle: "Матеріал недоступний",
    unavailableBody: "Цей матеріал не опублікований або більше не доступний.",
    publicTopicLabel: "Перевірена тема",
    topicIndexable: "Достатньо досвіду для індексації",
    topicNoindex: "Тема ще накопичує досвід",
    filters: {
      types: {
        all: "Усі формати",
        guide: "Гайди",
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
      "Авторски ръководства, кратки отговори и проверени теми, свързани с реални публични дневници за живи обекти.",
    heading: "Знания",
    intro:
      "Намерете ориентир и след това го проверете чрез датиран опит с реални живи обекти.",
    filtersLabel: "Филтри на знанията",
    searchLabel: "Търсене в знанията",
    searchPlaceholder: "Въпрос, задача, обект или тема",
    typeLabel: "Формат",
    kindLabel: "Жив обект",
    applyFilters: "Прилагане",
    resetFilters: "Нулиране",
    resultsTitle: "Намерени",
    guidesTitle: "Практични ръководства",
    answersTitle: "Кратки отговори",
    topicsTitle: "Теми с реален опит",
    editorialLabel: "Авторски материал",
    journalEvidenceLabel: "Опит от публични дневници",
    readGuide: "Отворете ръководството",
    readAnswer: "Прочетете отговора",
    exploreTopic: "Разгледайте темата",
    evidenceCountOne: "публичен запис",
    evidenceCountFew: "публични записа",
    evidenceCount: "публични записа",
    bylineLabel: "Автор",
    sourceLabel: "Основа на материала",
    updatedLabel: "Обновено",
    backToKnowledge: "Към знанията",
    whyMatched: "Защо е свързано",
    matchedByTopic: "Обща тема",
    matchedByCatalog: "Обща идентичност",
    readEntry: "Прочетете записа",
    viewObject: "Отворете живия обект",
    viewAllEvidence: "Отворете свързани дневници",
    emptyTitle: "Няма намерени материали",
    emptyBody: "Променете заявката или филтрите, за да видите други пътища.",
    emptyEvidenceTitle: "Все още няма публични доказателства",
    emptyEvidenceBody:
      "Материалът остава авторски ориентир. Липсващият опит не се заменя с измислени записи.",
    loadingLabel: "Зареждане на знания",
    errorTitle: "Знанията временно не са достъпни",
    errorBody:
      "Заявката не можа да бъде изпълнена и може безопасно да се повтори.",
    retry: "Опитайте отново",
    unavailableTitle: "Материалът е недостъпен",
    unavailableBody: "Този материал не е публикуван или вече не е достъпен.",
    publicTopicLabel: "Проверена тема",
    topicIndexable: "Има достатъчно опит за индексиране",
    topicNoindex: "Темата все още събира опит",
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
      "Авторские руководства, краткие ответы и проверенные темы, связанные с реальными публичными журналами живых объектов.",
    heading: "Знания",
    intro:
      "Найдите ориентир, а затем проверьте его на датированном опыте реальных живых объектов.",
    filtersLabel: "Фильтры знаний",
    searchLabel: "Поиск в знаниях",
    searchPlaceholder: "Вопрос, задача, объект или тема",
    typeLabel: "Формат",
    kindLabel: "Живой объект",
    applyFilters: "Применить",
    resetFilters: "Сбросить",
    resultsTitle: "Найдено",
    guidesTitle: "Практические руководства",
    answersTitle: "Краткие ответы",
    topicsTitle: "Темы с реальным опытом",
    editorialLabel: "Авторский материал",
    journalEvidenceLabel: "Опыт из публичных журналов",
    readGuide: "Открыть руководство",
    readAnswer: "Прочитать ответ",
    exploreTopic: "Открыть тему",
    evidenceCountOne: "публичная запись",
    evidenceCountFew: "публичные записи",
    evidenceCount: "публичных записей",
    bylineLabel: "Автор",
    sourceLabel: "Основа материала",
    updatedLabel: "Обновлено",
    backToKnowledge: "К знаниям",
    whyMatched: "Почему это связано",
    matchedByTopic: "Общая тема",
    matchedByCatalog: "Общая идентичность",
    readEntry: "Читать запись",
    viewObject: "Открыть живой объект",
    viewAllEvidence: "Открыть связанные журналы",
    emptyTitle: "Материалы не найдены",
    emptyBody: "Измените запрос или фильтры, чтобы увидеть другие пути.",
    emptyEvidenceTitle: "Публичных доказательств пока нет",
    emptyEvidenceBody:
      "Материал остается авторским ориентиром. Мы не заменяем отсутствующий опыт вымышленными записями.",
    loadingLabel: "Загрузка знаний",
    errorTitle: "Знания временно недоступны",
    errorBody: "Запрос не удалось выполнить. Его можно безопасно повторить.",
    retry: "Повторить",
    unavailableTitle: "Материал недоступен",
    unavailableBody: "Этот материал не опубликован или больше недоступен.",
    publicTopicLabel: "Проверенная тема",
    topicIndexable: "Достаточно опыта для индексации",
    topicNoindex: "Тема еще накапливает опыт",
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

export function getPublicKnowledgeCopy(locale: PublicLocale) {
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

function localeTag(locale: PublicLocale) {
  return { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale];
}
