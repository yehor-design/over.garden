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
