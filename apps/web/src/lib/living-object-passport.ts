import type { CatalogKind, PlantObjectKind, VarietyState } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";

export type LivingObjectPassportAudience = "public" | "owner";

export interface LivingObjectPassportBreadcrumb {
  href: string | null;
  label: string;
}

export interface LivingObjectPassportAction {
  href: string;
  label: string;
}

export interface LivingObjectPassportIdentity {
  label: string;
  value: string;
  state: string;
  catalogKind: CatalogKind | null;
  catalogPath: string | null;
}

export interface LivingObjectPassportCaretaker {
  displayName: string;
  mention: string | null;
  avatarUrl: string | null;
  profilePath: string | null;
}

export interface LivingObjectPassportFact {
  key: string;
  label: string;
  value: string;
  href?: string | null;
}

export interface LivingObjectPassportMedia {
  publicUrl: string;
  alt: string;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
}

export interface LivingObjectPassportTimelineEntryInput {
  id: string;
  title: string;
  body: string;
  entryDate: Date | string;
  href: string;
  mediaPublicUrl: string | null;
  mediaFocalX?: number | null;
  mediaFocalY?: number | null;
  mediaIntrinsicWidth?: number | null;
  mediaIntrinsicHeight?: number | null;
  stateLabel: string;
  relationLabel: string;
}

export interface LivingObjectPassportAdjacentEntry {
  id: string;
  title: string;
  href: string;
}

export interface LivingObjectPassportTimelineEntry extends LivingObjectPassportTimelineEntryInput {
  year: string;
  newer: LivingObjectPassportAdjacentEntry | null;
  older: LivingObjectPassportAdjacentEntry | null;
}

export interface LivingObjectPassportTimeline {
  totalCount: number;
  loadedCount: number;
  hasMore: boolean;
  entries: LivingObjectPassportTimelineEntry[];
}

interface LivingObjectPassportPresentationBase {
  objectId: string;
  objectKind: PlantObjectKind;
  displayName: string;
  passportLabel: string;
  breadcrumbs: LivingObjectPassportBreadcrumb[];
  identity: LivingObjectPassportIdentity;
  caretaker: LivingObjectPassportCaretaker;
  status: {
    label: string;
    latestDate: Date | string | null;
  };
  facts: LivingObjectPassportFact[];
  cover: LivingObjectPassportMedia | null;
  gallery: LivingObjectPassportMedia[];
  timeline: LivingObjectPassportTimeline;
  provenance: {
    count: number;
    label: string;
  };
  primaryAction: LivingObjectPassportAction | null;
  secondaryActions: LivingObjectPassportAction[];
}

export interface PublicLivingObjectPassportPresentation extends LivingObjectPassportPresentationBase {
  audience: "public";
}

export interface OwnerLivingObjectPassportPresentation extends LivingObjectPassportPresentationBase {
  audience: "owner";
  ownerContext: {
    spaceId: string;
    spaceName: string;
    locationLabel: string;
  };
}

export type LivingObjectPassportPresentation =
  | PublicLivingObjectPassportPresentation
  | OwnerLivingObjectPassportPresentation;

export interface LivingObjectPassportDomainCopy {
  kindLabel: string;
  identityLabel: string;
  contextLabel: string;
}

export interface LivingObjectPassportCopy {
  publicPassport: string;
  ownerPassport: string;
  livingObjects: string;
  myGarden: string;
  caretaker: string;
  you: string;
  defaultCaretaker: string;
  currentState: string;
  journalActive: string;
  newPassport: string;
  archivedHistory: string;
  catalogConfirmed: string;
  catalogPilot: string;
  catalogProvisional: string;
  catalogUnknown: string;
  unknownIdentity: string;
  safeContext: string;
  hiddenLocation: string;
  region: string;
  firstObservation: string;
  latestObservation: string;
  noObservations: string;
  chronology: string;
  publicChronology: string;
  ownerChronology: string;
  noPublicEntries: string;
  noOwnerEntries: string;
  readLatest: string;
  addUpdate: string;
  backToGarden: string;
  openCatalog: string;
  openProfile: string;
  publicEntry: string;
  privateEntry: string;
  archivedEntry: string;
  directObjectUpdate: string;
  spaceMention: string;
  newer: string;
  older: string;
  showAll: string;
  showRecent: string;
  readFullNote: string;
  entryPhotoAlt: string;
  mediaGallery: string;
  noPhoto: string;
  confirmedProvenance: string;
  provenanceRecords: string;
  passportRemoved: string;
  passportRemovedDescription: string;
  browseObjects: string;
  passportNotFound: string;
  passportNotFoundDescription: string;
}

const COPY: Record<InterfaceLocale, LivingObjectPassportCopy> = {
  uk: {
    publicPassport: "Публічний паспорт",
    ownerPassport: "Мій паспорт об'єкта",
    livingObjects: "Живі об'єкти",
    myGarden: "Моя градина",
    caretaker: "Доглядальник",
    you: "Ви",
    defaultCaretaker: "Доглядальник OverGarden",
    currentState: "Поточний стан",
    journalActive: "Журнал активний",
    newPassport: "Новий паспорт",
    archivedHistory: "Історію архівовано",
    catalogConfirmed: "Підтверджено каталогом",
    catalogPilot: "Попередній збіг каталогу",
    catalogProvisional: "Вказано користувачем",
    catalogUnknown: "Ідентичність уточнюється",
    unknownIdentity: "Поки не визначено",
    safeContext: "Безпечний контекст",
    hiddenLocation: "Місце приховано",
    region: "Регіон",
    firstObservation: "Перше спостереження",
    latestObservation: "Останнє спостереження",
    noObservations: "Спостережень ще немає",
    chronology: "Хронологія",
    publicChronology: "Публічний журнал об'єкта",
    ownerChronology: "Повна історія об'єкта",
    noPublicEntries: "Публічних записів для цього об'єкта ще немає.",
    noOwnerEntries: "Додайте перший датований запис, щоб почати історію.",
    readLatest: "Читати останній запис",
    addUpdate: "Новий запис",
    backToGarden: "До моєї градини",
    openCatalog: "Відкрити каталог",
    openProfile: "Відкрити профіль",
    publicEntry: "Публічний запис",
    privateEntry: "Приватний запис",
    archivedEntry: "Архівовано приватно",
    directObjectUpdate: "Запис об'єкта",
    spaceMention: "Згадка у просторі",
    newer: "Новіший запис",
    older: "Старіший запис",
    showAll: "Показати всі записи",
    showRecent: "Показати завантажену історію",
    readFullNote: "Прочитати нотатку повністю",
    entryPhotoAlt: "Фото до запису «{title}»",
    mediaGallery: "Фото об'єкта",
    noPhoto: "Фото ще немає",
    confirmedProvenance: "Підтверджене походження",
    provenanceRecords: "Записи походження",
    passportRemoved: "Паспорт видалено",
    passportRemovedDescription:
      "Цей публічний паспорт більше недоступний. Його записи прибрано з публічних поверхонь.",
    browseObjects: "Переглянути живі об'єкти",
    passportNotFound: "Паспорт не знайдено",
    passportNotFoundDescription:
      "Цей паспорт не опубліковано або він не існує.",
  },
  bg: {
    publicPassport: "Публичен паспорт",
    ownerPassport: "Моят паспорт на обекта",
    livingObjects: "Живи обекти",
    myGarden: "Моята градина",
    caretaker: "Грижещ се",
    you: "Вие",
    defaultCaretaker: "Грижещ се в OverGarden",
    currentState: "Текущо състояние",
    journalActive: "Дневникът е активен",
    newPassport: "Нов паспорт",
    archivedHistory: "Историята е архивирана",
    catalogConfirmed: "Потвърдено от каталога",
    catalogPilot: "Предварително каталожно съвпадение",
    catalogProvisional: "Посочено от потребителя",
    catalogUnknown: "Идентичността се уточнява",
    unknownIdentity: "Все още не е определено",
    safeContext: "Безопасен контекст",
    hiddenLocation: "Мястото е скрито",
    region: "Регион",
    firstObservation: "Първо наблюдение",
    latestObservation: "Последно наблюдение",
    noObservations: "Все още няма наблюдения",
    chronology: "Хронология",
    publicChronology: "Публичен дневник на обекта",
    ownerChronology: "Пълна история на обекта",
    noPublicEntries: "Все още няма публични записи за този обект.",
    noOwnerEntries: "Добавете първия запис с дата, за да започнете историята.",
    readLatest: "Прочетете последния запис",
    addUpdate: "Нов запис",
    backToGarden: "Към моята градина",
    openCatalog: "Отворете каталога",
    openProfile: "Отворете профила",
    publicEntry: "Публичен запис",
    privateEntry: "Личен запис",
    archivedEntry: "Архивирано лично",
    directObjectUpdate: "Запис за обекта",
    spaceMention: "Споменаване в пространство",
    newer: "По-нов запис",
    older: "По-стар запис",
    showAll: "Покажи всички записи",
    showRecent: "Покажи заредената история",
    readFullNote: "Прочетете цялата бележка",
    entryPhotoAlt: "Снимка към записа „{title}“",
    mediaGallery: "Снимки на обекта",
    noPhoto: "Все още няма снимка",
    confirmedProvenance: "Потвърден произход",
    provenanceRecords: "Записи за произход",
    passportRemoved: "Паспортът е премахнат",
    passportRemovedDescription:
      "Този публичен паспорт вече не е наличен. Записите му са премахнати от публичните раздели.",
    browseObjects: "Разгледайте живите обекти",
    passportNotFound: "Паспортът не е намерен",
    passportNotFoundDescription:
      "Този паспорт не е публикуван или не съществува.",
  },
  ru: {
    publicPassport: "Публичный паспорт",
    ownerPassport: "Мой паспорт объекта",
    livingObjects: "Живые объекты",
    myGarden: "Мой сад",
    caretaker: "Владелец ухода",
    you: "Вы",
    defaultCaretaker: "Пользователь OverGarden",
    currentState: "Текущее состояние",
    journalActive: "Журнал активен",
    newPassport: "Новый паспорт",
    archivedHistory: "История архивирована",
    catalogConfirmed: "Подтверждено каталогом",
    catalogPilot: "Предварительное совпадение каталога",
    catalogProvisional: "Указано пользователем",
    catalogUnknown: "Идентичность уточняется",
    unknownIdentity: "Пока не определено",
    safeContext: "Безопасный контекст",
    hiddenLocation: "Место скрыто",
    region: "Регион",
    firstObservation: "Первое наблюдение",
    latestObservation: "Последнее наблюдение",
    noObservations: "Наблюдений пока нет",
    chronology: "Хронология",
    publicChronology: "Публичный журнал объекта",
    ownerChronology: "Полная история объекта",
    noPublicEntries: "Публичных записей для этого объекта пока нет.",
    noOwnerEntries: "Добавьте первую запись с датой, чтобы начать историю.",
    readLatest: "Читать последнюю запись",
    addUpdate: "Новая запись",
    backToGarden: "В мой сад",
    openCatalog: "Открыть каталог",
    openProfile: "Открыть профиль",
    publicEntry: "Публичная запись",
    privateEntry: "Приватная запись",
    archivedEntry: "Архивировано приватно",
    directObjectUpdate: "Запись объекта",
    spaceMention: "Упоминание в пространстве",
    newer: "Более новая запись",
    older: "Более старая запись",
    showAll: "Показать все записи",
    showRecent: "Показать загруженную историю",
    readFullNote: "Прочитать заметку полностью",
    entryPhotoAlt: "Фото к записи «{title}»",
    mediaGallery: "Фотографии объекта",
    noPhoto: "Фотографий пока нет",
    confirmedProvenance: "Подтвержденное происхождение",
    provenanceRecords: "Записи происхождения",
    passportRemoved: "Паспорт удален",
    passportRemovedDescription:
      "Этот публичный паспорт больше недоступен. Его записи удалены из публичных разделов.",
    browseObjects: "Смотреть живые объекты",
    passportNotFound: "Паспорт не найден",
    passportNotFoundDescription:
      "Этот паспорт не опубликован или не существует.",
  },
};

const DOMAIN_COPY: Record<
  InterfaceLocale,
  Record<PlantObjectKind, LivingObjectPassportDomainCopy>
> = {
  uk: {
    plant: {
      kindLabel: "Рослина",
      identityLabel: "Сорт або вид",
      contextLabel: "Умови вирощування",
    },
    animal: {
      kindLabel: "Тварина",
      identityLabel: "Вид або порода",
      contextLabel: "Умови утримання",
    },
  },
  bg: {
    plant: {
      kindLabel: "Растение",
      identityLabel: "Сорт или вид",
      contextLabel: "Среда на отглеждане",
    },
    animal: {
      kindLabel: "Животно",
      identityLabel: "Вид или порода",
      contextLabel: "Среда на отглеждане",
    },
  },
  ru: {
    plant: {
      kindLabel: "Растение",
      identityLabel: "Сорт или вид",
      contextLabel: "Условия выращивания",
    },
    animal: {
      kindLabel: "Животное",
      identityLabel: "Вид или порода",
      contextLabel: "Условия содержания",
    },
  },
};

export function getLivingObjectPassportCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

export function getLivingObjectPassportDomain(
  locale: InterfaceLocale,
  objectKind: PlantObjectKind,
) {
  return DOMAIN_COPY[locale][objectKind];
}

export function livingObjectIdentityStateLabel(
  locale: InterfaceLocale,
  varietyState: VarietyState,
  hasCatalogIdentity: boolean,
) {
  const copy = getLivingObjectPassportCopy(locale);
  if (hasCatalogIdentity && varietyState === "selected") {
    return copy.catalogConfirmed;
  }
  if (hasCatalogIdentity) return copy.catalogPilot;
  if (varietyState === "user_added" || varietyState === "free_text") {
    return copy.catalogProvisional;
  }
  return copy.catalogUnknown;
}

export function buildLivingObjectTimeline(
  entries: LivingObjectPassportTimelineEntryInput[],
): LivingObjectPassportTimelineEntry[] {
  const ordered = entries
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .sort((left, right) => {
      const dateDelta =
        toSortableTimestamp(right.entry.entryDate) -
        toSortableTimestamp(left.entry.entryDate);
      if (dateDelta !== 0) return dateDelta;
      const idDelta = left.entry.id.localeCompare(right.entry.id);
      return idDelta !== 0 ? idDelta : left.sourceIndex - right.sourceIndex;
    })
    .map(({ entry }) => entry);

  return ordered.map((entry, index) => ({
    ...entry,
    year: timelineYear(entry.entryDate),
    newer: adjacentTimelineEntry(ordered[index - 1]),
    older: adjacentTimelineEntry(ordered[index + 1]),
  }));
}

export function formatLivingObjectPassportDate(
  value: Date | string,
  locale: InterfaceLocale,
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatLivingObjectPassportEntryCount(
  locale: InterfaceLocale,
  count: number,
) {
  const forms: Record<InterfaceLocale, Record<Intl.LDMLPluralRule, string>> = {
    uk: {
      zero: "записів",
      one: "запис",
      two: "записи",
      few: "записи",
      many: "записів",
      other: "запису",
    },
    bg: {
      zero: "записа",
      one: "запис",
      two: "записа",
      few: "записа",
      many: "записа",
      other: "записа",
    },
    ru: {
      zero: "записей",
      one: "запись",
      two: "записи",
      few: "записи",
      many: "записей",
      other: "записи",
    },
  };
  const rule = new Intl.PluralRules(locale).select(count);
  return `${count} ${forms[locale][rule]}`;
}

function adjacentTimelineEntry(
  entry: LivingObjectPassportTimelineEntryInput | undefined,
): LivingObjectPassportAdjacentEntry | null {
  return entry ? { id: entry.id, title: entry.title, href: entry.href } : null;
}

function timelineYear(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : String(date.getUTCFullYear());
}

function toSortableTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
