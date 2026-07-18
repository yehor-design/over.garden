import type { PublicLocale } from "@/lib/public-localization";

export interface PublicJournalEntryCopy {
  metadataTitleSuffix: string;
  metadataDescription: string;
  journals: string;
  journal: string;
  objectJournal: string;
  spaceJournal: string;
  by: string;
  safeRegion: string;
  locationHidden: string;
  identity: string;
  identityPending: string;
  media: string;
  topics: string;
  previousEntry: string;
  nextEntry: string;
  relatedHistory: string;
  mentionedObjects: string;
  mentionedGardeners: string;
  manageEntry: string;
  openObject: string;
  contextObject: string;
  contextHistory: string;
  contextTopics: string;
  contextAuthor: string;
  contextSpace: string;
}

const COPY = {
  uk: {
    metadataTitleSuffix: "Запис журналу",
    metadataDescription:
      "Датований публічний запис із журналу живого об'єкта в OverGarden.",
    journals: "Журнали",
    journal: "Журнал",
    objectJournal: "Журнал об'єкта",
    spaceJournal: "Журнал простору",
    by: "Автор",
    safeRegion: "Регіон",
    locationHidden: "Місце приховано",
    identity: "Ідентичність",
    identityPending: "Ідентичність уточнюється",
    media: "Фото запису",
    topics: "Теми",
    previousEntry: "Попередній запис",
    nextEntry: "Наступний запис",
    relatedHistory: "Ще з цього журналу",
    mentionedObjects: "Об'єкти в записі",
    mentionedGardeners: "Згадані садівники",
    manageEntry: "Керувати записом",
    openObject: "Відкрити паспорт",
    contextObject: "Живий об'єкт",
    contextHistory: "Продовження журналу",
    contextTopics: "Теми запису",
    contextAuthor: "Автор",
    contextSpace: "Простір",
  },
  bg: {
    metadataTitleSuffix: "Запис в дневник",
    metadataDescription:
      "Датиран публичен запис от дневника на жив обект в OverGarden.",
    journals: "Дневници",
    journal: "Дневник",
    objectJournal: "Дневник на обекта",
    spaceJournal: "Дневник на пространството",
    by: "Автор",
    safeRegion: "Регион",
    locationHidden: "Местоположението е скрито",
    identity: "Идентичност",
    identityPending: "Идентичността се уточнява",
    media: "Снимки към записа",
    topics: "Теми",
    previousEntry: "Предишен запис",
    nextEntry: "Следващ запис",
    relatedHistory: "Още от този дневник",
    mentionedObjects: "Обекти в записа",
    mentionedGardeners: "Споменати градинари",
    manageEntry: "Управление на записа",
    openObject: "Отваряне на паспорта",
    contextObject: "Жив обект",
    contextHistory: "Продължение на дневника",
    contextTopics: "Теми на записа",
    contextAuthor: "Автор",
    contextSpace: "Пространство",
  },
  ru: {
    metadataTitleSuffix: "Запись журнала",
    metadataDescription:
      "Датированная публичная запись из журнала живого объекта в OverGarden.",
    journals: "Журналы",
    journal: "Журнал",
    objectJournal: "Журнал объекта",
    spaceJournal: "Журнал пространства",
    by: "Автор",
    safeRegion: "Регион",
    locationHidden: "Местоположение скрыто",
    identity: "Идентичность",
    identityPending: "Идентичность уточняется",
    media: "Фотографии записи",
    topics: "Темы",
    previousEntry: "Предыдущая запись",
    nextEntry: "Следующая запись",
    relatedHistory: "Ещё из этого журнала",
    mentionedObjects: "Объекты в записи",
    mentionedGardeners: "Упомянутые садоводы",
    manageEntry: "Управлять записью",
    openObject: "Открыть паспорт",
    contextObject: "Живой объект",
    contextHistory: "Продолжение журнала",
    contextTopics: "Темы записи",
    contextAuthor: "Автор",
    contextSpace: "Пространство",
  },
} as const satisfies Record<PublicLocale, PublicJournalEntryCopy>;

export function getPublicJournalEntryCopy(
  locale: PublicLocale,
): PublicJournalEntryCopy {
  return COPY[locale];
}
