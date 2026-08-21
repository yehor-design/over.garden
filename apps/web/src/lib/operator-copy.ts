import type { AdminCapability, AdminRole } from "@/lib/admin/roles";
import type { InterfaceLocale } from "@/lib/interface-localization";

export type WidenCopy<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly unknown[]
      ? { readonly [K in keyof T]: WidenCopy<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: WidenCopy<T[K]> }
        : T;

const UK_COPY = {
  common: {
    accessDenied: "Доступ заборонено.",
    backToJournal: "Назад до журналу",
    gardenJournal: "Журнал саду",
    role: "Роль",
    gate: "Режим доступу",
    status: "Статус",
    generated: "Сформовано",
    records: "Записи",
    requests: "Запити",
    rows: "Рядки",
    source: "Джерело",
    license: "Ліцензія",
    parser: "Парсер",
    verified: "Перевірено",
    unknown: "Невідомо",
    publicPage: "Публічна сторінка",
    attributionRequired: "потрібна атрибуція",
    primary: "основний",
    typeahead: "пошук під час введення",
    count: "Кількість",
    notServerObservable: "не спостерігається на сервері",
    roles: {
      owner: "Власник",
      admin: "Адміністратор",
      operator: "Оператор",
      moderator: "Модератор",
    },
    capabilities: {
      "admin:read": "читання інструментів власника",
      "operator:read": "читання операторських даних",
      "operator:mutate": "операторські зміни",
      "erasure:execute": "схвалене виконання видалення",
    },
    accessModes: {
      sealed_owner_credential_only: "лише захищений власник з паролем",
      delegated_operator: "делегований оператор",
      assigned_moderator: "призначений модератор",
    },
  },
  community: {
    title: "Модерація спільнот",
    description:
      "Fail-closed панель керування кураторською спільнотою. Публічні списки учасників і приватні поля журналів навмисно відсутні.",
    backToGarden: "Назад до саду",
    observationAndCare: "Спостереження та догляд",
    cardDescription:
      "Черга модератора, шлюз участі, вилучення, керування учасниками та аудит рішень щодо скарг.",
    openReportsCount: "відкритих скарг: {count}",
    unavailable: "Доступ модератора спільноти недоступний.",
    moderationResult: "Результат модерації",
    participationGate: "Шлюз участі",
    currentState: "Поточний стан",
    closeParticipation: "Закрити участь",
    openParticipation: "Відкрити участь",
    openReports: "Відкриті скарги",
    noReports: "Поданих скарг немає.",
    journalUnavailable: "Журнал більше не є публічним",
    reported: "Надіслано",
    contribution: "внесок",
    discussion: "обговорення",
    openJournal: "Відкрити канонічний журнал",
    removeContribution: "Вилучити зі спільноти",
    restoreContribution: "Відновити внесок",
    closeDiscussion: "Закрити обговорення",
    openDiscussion: "Відкрити обговорення",
    banParticipant: "Заблокувати учасника",
    resolveActioned: "Позначити вирішеною із дією",
    dismissReport: "Відхилити скаргу",
    backToCommunity: "Назад до спільноти",
    backToCommunities: "Назад до спільнот",
    states: {
      open: "відкрито",
      closed: "закрито",
      active: "активний",
      removed: "вилучений",
      banned: "заблокований",
      submitted: "подано",
      actioned: "виконано дію",
      dismissed: "відхилено",
      unavailable: "недоступно",
      updated: "оновлено",
    },
  },
  moderation: {
    metadataTitle: "Модерація коментарів | OverGarden",
    title: "Модерація коментарів",
    description:
      "Захищена черга скарг без приватного вмісту саду та даних автентифікації.",
    empty: "Відкритих скарг на коментарі немає.",
  },
  health: {
    metadataTitle: "Стан інфраструктури | OverGarden",
    metadataDescription:
      "Публічний noindex-маршрут діагностики доступності OverGarden і ручних smoke-перевірок.",
    title: "Стан інфраструктури",
    description:
      "Публічна noindex-діагностика доступності та ручних smoke-перевірок. Це не інтерфейс продукту.",
    renderedAt: "Сформовано на сервері о",
    utf8: "UTF-8 / кирилиця",
    auth: "Автентифікація (Better Auth)",
    database: "База даних (Kysely / Postgres)",
    authVersionedCurrent:
      "Маршрут Better Auth підключено — versioned_current_v{version}",
    authLegacyTransition:
      "Маршрут Better Auth підключено — legacy_transition; потрібна підготовлена versioned-конфігурація",
    authClosed:
      "Маршрут Better Auth підключено — secret відсутній або схожий на placeholder, автентифікація fail-closed",
    authLocalFallback:
      "Маршрут Better Auth підключено — активний лише локальний fallback",
    dbOk: "Читання Kysely успішне — ping={ping} · рядків стану: {count}",
    dbUnavailable:
      "Діагностику показано в обмеженому режимі; доступні перевірки продовжуються без відповіді бази даних",
    primaryButton: "Кнопка shadcn (SSR)",
    outlineButton: "Контурна",
  },
} as const;

export type OperatorCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY = {
  common: {
    accessDenied: "Достъпът е отказан.",
    backToJournal: "Назад към дневника",
    gardenJournal: "Дневник на градината",
    role: "Роля",
    gate: "Режим на достъп",
    status: "Статус",
    generated: "Генерирано",
    records: "Записи",
    requests: "Заявки",
    rows: "Редове",
    source: "Източник",
    license: "Лиценз",
    parser: "Парсер",
    verified: "Проверено",
    unknown: "Неизвестно",
    publicPage: "Публична страница",
    attributionRequired: "изисква се посочване на източника",
    primary: "основен",
    typeahead: "търсене при въвеждане",
    count: "Брой",
    notServerObservable: "не се наблюдава от сървъра",
    roles: {
      owner: "Собственик",
      admin: "Администратор",
      operator: "Оператор",
      moderator: "Модератор",
    },
    capabilities: {
      "admin:read": "четене на инструментите на собственика",
      "operator:read": "четене на операторски данни",
      "operator:mutate": "операторски промени",
      "erasure:execute": "одобрено изпълнение на изтриване",
    },
    accessModes: {
      sealed_owner_credential_only: "само защитен собственик с парола",
      delegated_operator: "делегиран оператор",
      assigned_moderator: "назначен модератор",
    },
  },
  community: {
    title: "Модерация на общности",
    description:
      "Fail-closed контролен панел за курираната общност. Публичните списъци с членове и личните полета на дневниците умишлено отсъстват.",
    backToGarden: "Назад към градината",
    observationAndCare: "Наблюдение и грижа",
    cardDescription:
      "Опашка за модерация, шлюз за участие, премахвания, контрол на членове и одитирани решения по сигнали.",
    openReportsCount: "отворени сигнали: {count}",
    unavailable: "Достъпът за модератор на общността не е наличен.",
    moderationResult: "Резултат от модерацията",
    participationGate: "Шлюз за участие",
    currentState: "Текущо състояние",
    closeParticipation: "Затвори участието",
    openParticipation: "Отвори участието",
    openReports: "Отворени сигнали",
    noReports: "Няма подадени сигнали.",
    journalUnavailable: "Дневникът вече не е публичен",
    reported: "Подадено",
    contribution: "принос",
    discussion: "дискусия",
    openJournal: "Отвори каноничния дневник",
    removeContribution: "Премахни от общността",
    restoreContribution: "Възстанови приноса",
    closeDiscussion: "Затвори дискусията",
    openDiscussion: "Отвори дискусията",
    banParticipant: "Блокирай участника",
    resolveActioned: "Отбележи като решен с действие",
    dismissReport: "Отхвърли сигнала",
    backToCommunity: "Назад към общността",
    backToCommunities: "Назад към общностите",
    states: {
      open: "отворено",
      closed: "затворено",
      active: "активен",
      removed: "премахнат",
      banned: "блокиран",
      submitted: "подаден",
      actioned: "предприето действие",
      dismissed: "отхвърлен",
      unavailable: "недостъпно",
      updated: "обновено",
    },
  },
  moderation: {
    metadataTitle: "Модериране на коментари | OverGarden",
    title: "Модериране на коментари",
    description:
      "Защитена опашка със сигнали без лично съдържание от градината или данни за удостоверяване.",
    empty: "Няма отворени сигнали за коментари.",
  },
  health: {
    metadataTitle: "Състояние на инфраструктурата | OverGarden",
    metadataDescription:
      "Публичен noindex диагностичен маршрут за достъпност на OverGarden и ръчни smoke проверки.",
    title: "Състояние на инфраструктурата",
    description:
      "Публична noindex диагностика за достъпност и ръчни smoke проверки. Това не е продуктов интерфейс.",
    renderedAt: "Генерирано на сървъра в",
    utf8: "UTF-8 / кирилица",
    auth: "Автентикация (Better Auth)",
    database: "База данни (Kysely / Postgres)",
    authVersionedCurrent:
      "Маршрутът на Better Auth е свързан — versioned_current_v{version}",
    authLegacyTransition:
      "Маршрутът на Better Auth е свързан — legacy_transition; нужна е подготвена versioned конфигурация",
    authClosed:
      "Маршрутът на Better Auth е свързан — secret липсва или прилича на placeholder, автентикацията е fail-closed",
    authLocalFallback:
      "Маршрутът на Better Auth е свързан — активен е само локалният fallback",
    dbOk: "Четенето с Kysely е успешно — ping={ping} · редове за състояние: {count}",
    dbUnavailable:
      "Диагностиката е показана в ограничен режим; наличните проверки продължават без отговор от базата данни",
    primaryButton: "Бутон shadcn (SSR)",
    outlineButton: "Контурен",
  },
} as const satisfies OperatorCopy;

const RU_COPY = {
  common: {
    accessDenied: "Доступ запрещён.",
    backToJournal: "Назад к журналу",
    gardenJournal: "Журнал сада",
    role: "Роль",
    gate: "Режим доступа",
    status: "Статус",
    generated: "Сформировано",
    records: "Записи",
    requests: "Запросы",
    rows: "Строки",
    source: "Источник",
    license: "Лицензия",
    parser: "Парсер",
    verified: "Проверено",
    unknown: "Неизвестно",
    publicPage: "Публичная страница",
    attributionRequired: "требуется атрибуция",
    primary: "основной",
    typeahead: "поиск при вводе",
    count: "Количество",
    notServerObservable: "не наблюдается на сервере",
    roles: {
      owner: "Владелец",
      admin: "Администратор",
      operator: "Оператор",
      moderator: "Модератор",
    },
    capabilities: {
      "admin:read": "чтение инструментов владельца",
      "operator:read": "чтение операторских данных",
      "operator:mutate": "операторские изменения",
      "erasure:execute": "одобренное выполнение удаления",
    },
    accessModes: {
      sealed_owner_credential_only: "только защищённый владелец с паролем",
      delegated_operator: "делегированный оператор",
      assigned_moderator: "назначенный модератор",
    },
  },
  community: {
    title: "Модерация сообществ",
    description:
      "Fail-closed панель управления курируемым сообществом. Публичные списки участников и личные поля журналов намеренно отсутствуют.",
    backToGarden: "Назад в сад",
    observationAndCare: "Наблюдение и уход",
    cardDescription:
      "Очередь модерации, шлюз участия, удаления, управление участниками и аудит решений по жалобам.",
    openReportsCount: "открытых жалоб: {count}",
    unavailable: "Доступ модератора сообщества недоступен.",
    moderationResult: "Результат модерации",
    participationGate: "Шлюз участия",
    currentState: "Текущее состояние",
    closeParticipation: "Закрыть участие",
    openParticipation: "Открыть участие",
    openReports: "Открытые жалобы",
    noReports: "Поданных жалоб нет.",
    journalUnavailable: "Журнал больше не является публичным",
    reported: "Отправлено",
    contribution: "вклад",
    discussion: "обсуждение",
    openJournal: "Открыть канонический журнал",
    removeContribution: "Удалить из сообщества",
    restoreContribution: "Восстановить вклад",
    closeDiscussion: "Закрыть обсуждение",
    openDiscussion: "Открыть обсуждение",
    banParticipant: "Заблокировать участника",
    resolveActioned: "Отметить решённой с действием",
    dismissReport: "Отклонить жалобу",
    backToCommunity: "Назад к сообществу",
    backToCommunities: "Назад к сообществам",
    states: {
      open: "открыто",
      closed: "закрыто",
      active: "активный",
      removed: "удалён",
      banned: "заблокирован",
      submitted: "подано",
      actioned: "выполнено действие",
      dismissed: "отклонено",
      unavailable: "недоступно",
      updated: "обновлено",
    },
  },
  moderation: {
    metadataTitle: "Модерация комментариев | OverGarden",
    title: "Модерация комментариев",
    description:
      "Защищённая очередь жалоб без личного содержимого сада и данных аутентификации.",
    empty: "Открытых жалоб на комментарии нет.",
  },
  health: {
    metadataTitle: "Состояние инфраструктуры | OverGarden",
    metadataDescription:
      "Публичный noindex-маршрут диагностики доступности OverGarden и ручных smoke-проверок.",
    title: "Состояние инфраструктуры",
    description:
      "Публичная noindex-диагностика доступности и ручных smoke-проверок. Это не интерфейс продукта.",
    renderedAt: "Сформировано на сервере в",
    utf8: "UTF-8 / кириллица",
    auth: "Аутентификация (Better Auth)",
    database: "База данных (Kysely / Postgres)",
    authVersionedCurrent:
      "Маршрут Better Auth подключён — versioned_current_v{version}",
    authLegacyTransition:
      "Маршрут Better Auth подключён — legacy_transition; нужна подготовленная versioned-конфигурация",
    authClosed:
      "Маршрут Better Auth подключён — secret отсутствует или похож на placeholder, аутентификация fail-closed",
    authLocalFallback:
      "Маршрут Better Auth подключён — активен только локальный fallback",
    dbOk: "Чтение Kysely успешно — ping={ping} · строк состояния: {count}",
    dbUnavailable:
      "Диагностика показана в ограниченном режиме; доступные проверки продолжаются без ответа базы данных",
    primaryButton: "Кнопка shadcn (SSR)",
    outlineButton: "Контурная",
  },
} as const satisfies OperatorCopy;

const COPY_BY_LOCALE = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
} satisfies Record<InterfaceLocale, OperatorCopy>;

const DATE_LOCALE_BY_INTERFACE_LOCALE: Record<InterfaceLocale, string> = {
  uk: "uk-UA",
  bg: "bg-BG",
  ru: "ru-RU",
};

export function getOperatorCopy(locale: InterfaceLocale): OperatorCopy {
  return COPY_BY_LOCALE[locale];
}

export function getOperatorDatabaseAvailabilityCopy(locale: InterfaceLocale) {
  return {
    message: getOperatorCopy(locale).health.dbUnavailable,
    serveClass: "seam_unmet" as const,
  };
}

export function formatOperatorTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function formatOperatorDate(
  locale: InterfaceLocale,
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    return getOperatorCopy(locale).common.unknown;
  return new Intl.DateTimeFormat(
    DATE_LOCALE_BY_INTERFACE_LOCALE[locale],
    options,
  ).format(date);
}

export function operatorRoleLabel(locale: InterfaceLocale, role: AdminRole) {
  return getOperatorCopy(locale).common.roles[role];
}

export function operatorCapabilityLabel(
  locale: InterfaceLocale,
  capabilities: AdminCapability[],
) {
  const labels = getOperatorCopy(locale).common.capabilities;
  return capabilities.map((capability) => labels[capability]).join(", ");
}

export function operatorAccessModeLabel(locale: InterfaceLocale, mode: string) {
  const labels = getOperatorCopy(locale).common.accessModes;
  return labels[mode as keyof typeof labels] ?? mode;
}

export function operatorCommunityStateLabel(
  locale: InterfaceLocale,
  state: string,
) {
  const labels = getOperatorCopy(locale).community.states;
  return labels[state as keyof typeof labels] ?? state;
}
