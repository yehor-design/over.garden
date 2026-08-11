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
    admin: "Адміністрування",
    pilotHealth: "Стан пілоту",
    pilotSmoke: "Перевірка пілоту",
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
      "admin:read": "читання адмінпанелі",
      "admin:manage_roles": "перегляд захищеного власника",
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
  admin: {
    metadataTitle: "Адміністрування | OverGarden",
    title: "Адміністрування",
    description: "Внутрішня панель керування пілотом OverGarden.",
    controlPlane: "Панель керування",
    controlPlaneDescription:
      "Захищена точка входу для внутрішніх операцій, доступна лише власнику. Панель показує тільки посилання та стани без приватних даних садівників.",
    links: {
      communities: {
        label: "Модерація спільнот",
        detail: "Скарги, участь, вилучення та безпека учасників",
        required: "Лише призначений модератор",
      },
      users: {
        label: "Захищений власник",
        detail: "Статус єдиного власника та журнал аудиту",
        required: "Лише читання: тільки налаштований власник",
      },
      smoke: {
        label: "Перевірка пілоту",
        detail: "Контракт готовності production",
        required: "Лише власник",
      },
      health: {
        label: "Стан пілоту",
        detail: "Агреговані сигнали активації",
        required: "Лише власник",
      },
      curation: {
        label: "Курація каталогу",
        detail: "Перевірка джерел та ідентичностей",
        required: "Лише власник",
      },
      erasure: {
        label: "Запити на видалення",
        detail: "Перевірка запитів щодо приватності",
        required: "Лише власник",
      },
    },
    boundaryTitle: "Межі ролі",
    boundary: {
      storedLabel: "Збережено",
      storedValue: "Метадані надання ролі",
      excludedLabel: "Виключено",
      excludedValue: "Чутливі поля автентифікації та запитів",
      privateLabel: "Приватні дані",
      privateValue: "Тут не відображаються",
      capabilitiesLabel: "Можливості",
    },
  },
  adminUsers: {
    metadataTitle: "Захищений власник | OverGarden",
    title: "Захищений власник",
    description:
      "Статус захищеного власника та журнал аудиту внутрішньої панелі керування.",
    accessTitle: "Доступ захищеного власника",
    accessDescription:
      "Адміністративний доступ закріплено за одним налаштованим обліковим записом власника з електронною поштою та паролем. Ця сторінка доступна лише для читання й не може надавати можливості іншим користувачам.",
    assignmentsTitle: "Поточне захищене призначення",
    assignmentCount: {
      one: "призначення",
      few: "призначення",
      many: "призначень",
      other: "призначення",
    },
    noAssignment: "Захищене призначення власника ще не створено.",
    auditTitle: "Останній аудит ролей",
    auditDescription:
      "Записи аудиту містять внутрішні ID, обмежені enum ролі, дії та причини, а також односторонній хеш сесії. Тут не відображаються електронні адреси, cookies, необроблені ID сесій, IP чи user-agent, токени провайдерів, вміст журналу, ключі медіа, координати або значення середовища.",
    noAudit: "Зміни ролей ще не зафіксовано.",
    reason: "Причина",
    updated: "Оновлено",
    grantedBy: "Надано користувачем",
    ownerSealed:
      "Роль власника закріплено за налаштованим обліковим записом з електронною поштою та паролем.",
    invalidAssignment:
      "Це призначення не приймається захищеним шлюзом власника й має бути прибране через доступний лише оператору шлях обслуговування бази даних.",
    granted: "Надано",
    revoked: "Відкликано",
    actor: "Виконавець",
    target: "Ціль",
    userRemoved: "користувача видалено",
    roleFallback: "роль",
    userReference: "користувач {prefix}...{suffix}",
    reasons: {
      manual_bootstrap: "Ручна початкова ініціалізація",
      manual_owner_grant: "Ручне надання ролі власника",
      pilot_operator_delegation: "Делегування оператора пілоту",
      temporary_coverage: "Тимчасове заміщення",
      role_cleanup: "Очищення ролей",
      access_revoked: "Доступ відкликано",
    },
  },
  community: {
    title: "Модерація спільнот",
    description:
      "Fail-closed панель керування кураторською спільнотою. Публічні списки учасників і приватні поля журналів навмисно відсутні.",
    backToAdmin: "Назад до адміністрування",
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
    dbUnavailable: "Перевірка бази даних недоступна в цьому середовищі",
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
    admin: "Администриране",
    pilotHealth: "Състояние на пилота",
    pilotSmoke: "Проверка на пилота",
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
      "admin:read": "четене на администрацията",
      "admin:manage_roles": "преглед на защитения собственик",
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
  admin: {
    metadataTitle: "Администриране | OverGarden",
    title: "Администриране",
    description: "Вътрешен контролен панел за пилота на OverGarden.",
    controlPlane: "Контролен панел",
    controlPlaneDescription:
      "Защитена входна точка за вътрешни операции, достъпна само за собственика. Панелът показва само връзки и състояния без лични данни на градинари.",
    links: {
      communities: {
        label: "Модерация на общности",
        detail: "Сигнали, участие, премахвания и безопасност на членовете",
        required: "Само назначен модератор",
      },
      users: {
        label: "Защитен собственик",
        detail: "Статус на единствения собственик и одитна следа",
        required: "Само за четене: само конфигурираният собственик",
      },
      smoke: {
        label: "Проверка на пилота",
        detail: "Договор за готовност на production",
        required: "Само собственик",
      },
      health: {
        label: "Състояние на пилота",
        detail: "Агрегирани сигнали за активация",
        required: "Само собственик",
      },
      curation: {
        label: "Куриране на каталога",
        detail: "Преглед на източници и идентичности",
        required: "Само собственик",
      },
      erasure: {
        label: "Заявки за изтриване",
        detail: "Преглед на заявки за поверителност",
        required: "Само собственик",
      },
    },
    boundaryTitle: "Граници на ролята",
    boundary: {
      storedLabel: "Съхранява се",
      storedValue: "Метаданни за предоставяне на роля",
      excludedLabel: "Изключено",
      excludedValue: "Чувствителни полета за автентикация и заявки",
      privateLabel: "Лични данни",
      privateValue: "Не се показват тук",
      capabilitiesLabel: "Възможности",
    },
  },
  adminUsers: {
    metadataTitle: "Защитен собственик | OverGarden",
    title: "Защитен собственик",
    description:
      "Статус на защитения собственик и одитна следа за вътрешния контролен панел.",
    accessTitle: "Достъп на защитения собственик",
    accessDescription:
      "Административният достъп е заключен към един конфигуриран профил на собственик с имейл и парола. Тази страница е само за четене и не може да предоставя възможности на друг потребител.",
    assignmentsTitle: "Текущо защитено назначение",
    assignmentCount: {
      one: "назначение",
      few: "назначения",
      many: "назначения",
      other: "назначения",
    },
    noAssignment: "Все още няма създадено защитено назначение на собственик.",
    auditTitle: "Последен одит на ролите",
    auditDescription:
      "Одитните записи съдържат вътрешни ID, ограничени enum стойности за роля, действие и причина, както и еднопосочен хеш на сесията. Тук не се показват имейли, cookies, необработени ID на сесии, IP или user-agent, токени на доставчици, съдържание на дневника, медийни ключове, координати или стойности на средата.",
    noAudit: "Все още няма записани промени на роли.",
    reason: "Причина",
    updated: "Обновено",
    grantedBy: "Предоставено от",
    ownerSealed:
      "Ролята на собственик е заключена към конфигурирания профил с имейл и парола.",
    invalidAssignment:
      "Това назначение не се приема от защитения шлюз на собственика и трябва да бъде почистено чрез достъпен само за оператор път за поддръжка на базата данни.",
    granted: "Предоставено",
    revoked: "Отнето",
    actor: "Изпълнител",
    target: "Цел",
    userRemoved: "потребителят е премахнат",
    roleFallback: "роля",
    userReference: "потребител {prefix}...{suffix}",
    reasons: {
      manual_bootstrap: "Ръчна първоначална настройка",
      manual_owner_grant: "Ръчно предоставяне на собственик",
      pilot_operator_delegation: "Делегиране на пилотен оператор",
      temporary_coverage: "Временно заместване",
      role_cleanup: "Почистване на роли",
      access_revoked: "Достъпът е отнет",
    },
  },
  community: {
    title: "Модерация на общности",
    description:
      "Fail-closed контролен панел за курираната общност. Публичните списъци с членове и личните полета на дневниците умишлено отсъстват.",
    backToAdmin: "Назад към администрирането",
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
    dbUnavailable: "Проверката на базата данни не е налична в тази среда",
    primaryButton: "Бутон shadcn (SSR)",
    outlineButton: "Контурен",
  },
} as const satisfies OperatorCopy;

const RU_COPY = {
  common: {
    accessDenied: "Доступ запрещён.",
    backToJournal: "Назад к журналу",
    gardenJournal: "Журнал сада",
    admin: "Администрирование",
    pilotHealth: "Состояние пилота",
    pilotSmoke: "Проверка пилота",
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
      "admin:read": "чтение админпанели",
      "admin:manage_roles": "просмотр защищённого владельца",
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
  admin: {
    metadataTitle: "Администрирование | OverGarden",
    title: "Администрирование",
    description: "Внутренняя панель управления пилотом OverGarden.",
    controlPlane: "Панель управления",
    controlPlaneDescription:
      "Защищённая точка входа для внутренних операций, доступная только владельцу. Панель показывает только ссылки и состояния без личных данных садоводов.",
    links: {
      communities: {
        label: "Модерация сообществ",
        detail: "Жалобы, участие, удаления и безопасность участников",
        required: "Только назначенный модератор",
      },
      users: {
        label: "Защищённый владелец",
        detail: "Статус единственного владельца и журнал аудита",
        required: "Только чтение: только настроенный владелец",
      },
      smoke: {
        label: "Проверка пилота",
        detail: "Контракт готовности production",
        required: "Только владелец",
      },
      health: {
        label: "Состояние пилота",
        detail: "Агрегированные сигналы активации",
        required: "Только владелец",
      },
      curation: {
        label: "Курация каталога",
        detail: "Проверка источников и идентичностей",
        required: "Только владелец",
      },
      erasure: {
        label: "Запросы на удаление",
        detail: "Проверка запросов о конфиденциальности",
        required: "Только владелец",
      },
    },
    boundaryTitle: "Границы роли",
    boundary: {
      storedLabel: "Сохранено",
      storedValue: "Метаданные предоставления роли",
      excludedLabel: "Исключено",
      excludedValue: "Чувствительные поля аутентификации и запросов",
      privateLabel: "Личные данные",
      privateValue: "Здесь не отображаются",
      capabilitiesLabel: "Возможности",
    },
  },
  adminUsers: {
    metadataTitle: "Защищённый владелец | OverGarden",
    title: "Защищённый владелец",
    description:
      "Статус защищённого владельца и журнал аудита внутренней панели управления.",
    accessTitle: "Доступ защищённого владельца",
    accessDescription:
      "Административный доступ закреплён за одной настроенной учётной записью владельца с электронной почтой и паролем. Эта страница доступна только для чтения и не может предоставлять возможности другим пользователям.",
    assignmentsTitle: "Текущее защищённое назначение",
    assignmentCount: {
      one: "назначение",
      few: "назначения",
      many: "назначений",
      other: "назначения",
    },
    noAssignment: "Защищённое назначение владельца ещё не создано.",
    auditTitle: "Недавний аудит ролей",
    auditDescription:
      "Записи аудита содержат внутренние ID, ограниченные enum роли, действия и причины, а также односторонний хеш сессии. Здесь не отображаются электронные адреса, cookies, необработанные ID сессий, IP или user-agent, токены провайдеров, содержимое журнала, ключи медиа, координаты или значения среды.",
    noAudit: "Изменения ролей ещё не зафиксированы.",
    reason: "Причина",
    updated: "Обновлено",
    grantedBy: "Предоставлено пользователем",
    ownerSealed:
      "Роль владельца закреплена за настроенной учётной записью с электронной почтой и паролем.",
    invalidAssignment:
      "Это назначение не принимается защищённым шлюзом владельца и должно быть очищено через доступный только оператору путь обслуживания базы данных.",
    granted: "Предоставлено",
    revoked: "Отозвано",
    actor: "Исполнитель",
    target: "Цель",
    userRemoved: "пользователь удалён",
    roleFallback: "роль",
    userReference: "пользователь {prefix}...{suffix}",
    reasons: {
      manual_bootstrap: "Ручная первоначальная настройка",
      manual_owner_grant: "Ручное предоставление роли владельца",
      pilot_operator_delegation: "Делегирование оператора пилота",
      temporary_coverage: "Временное замещение",
      role_cleanup: "Очистка ролей",
      access_revoked: "Доступ отозван",
    },
  },
  community: {
    title: "Модерация сообществ",
    description:
      "Fail-closed панель управления курируемым сообществом. Публичные списки участников и личные поля журналов намеренно отсутствуют.",
    backToAdmin: "Назад к администрированию",
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
    dbUnavailable: "Проверка базы данных недоступна в этой среде",
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

export function formatOperatorCount(
  locale: InterfaceLocale,
  count: number,
  forms: OperatorCopy["adminUsers"]["assignmentCount"],
) {
  const category = new Intl.PluralRules(
    DATE_LOCALE_BY_INTERFACE_LOCALE[locale],
  ).select(count) as keyof typeof forms;
  return `${count} ${forms[category] ?? forms.other}`;
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
