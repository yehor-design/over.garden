import type { CatalogSourceRefreshCadence } from "@/lib/catalog/source-cadence";
import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The owner's two curation surfaces (ADR-0026 D10): the decision queue and
 * the sources page. Every string a curator reads lives here in the three
 * interface languages; nothing on these pages is a gardener's words.
 */
export interface OperatorCatalogCopy {
  queue: {
    metadataTitle: string;
    title: string;
    description: string;
    empty: string;
    open: string;
    impact: string;
    confidence: string;
    reasons: string;
    filterAll: string;
    itemTypes: Record<
      "label_link" | "node_merge" | "source_link" | "split_review",
      string
    >;
    subject: string;
    target: string;
    label: string;
    objects: string;
    entries: string;
    identifiers: string;
    accept: string;
    reject: string;
    skip: string;
    undo: string;
    previousItem: string;
    nextItem: string;
    position: string;
    keyboardHint: string;
    confirmMerge: string;
    confirmMergeHint: string;
    automatic: string;
    automaticEmpty: string;
    automaticHint: string;
    reverted: string;
    appliedAt: string;
  };
  sources: {
    metadataTitle: string;
    title: string;
    description: string;
    empty: string;
    version: string;
    license: string;
    fetchedAt: string;
    records: string;
    linked: string;
    identifiers: string;
    assertions: string;
    refresh: string;
    refreshQueued: string;
    lastRefresh: string;
    attribution: string;
    openSource: string;
    cadence: string;
    cadenceNames: Record<CatalogSourceRefreshCadence, string>;
  };
  /** ADR-0026 D12: the catalog's own numbers, where the owner already works. */
  health: {
    title: string;
    description: string;
    empty: string;
    window: Record<"7" | "30", string>;
    attempts: string;
    pickSuccess: string;
    ownLabel: string;
    abandoned: string;
    medianTimeToPick: string;
    p95TimeToPick: string;
    notMeasured: string;
    misses: string;
    missesHint: string;
    missesEmpty: string;
    makeQueueItem: string;
    occurrences: string;
    precision: string;
    precisionHint: string;
    precisionEmpty: string;
    applied: string;
    reverted: string;
    queueAge: string;
    queueAgeEmpty: string;
    days: string;
  };
  card: {
    ownerTools: string;
    rename: string;
    renameHint: string;
    newName: string;
    reason: string;
    pinName: string;
    pinNameHint: string;
    merge: string;
    mergeHint: string;
    mergeTarget: string;
    mergeConfirm: string;
    audit: string;
    auditEmpty: string;
    undo: string;
    reverted: string;
    indexable: string;
    indexableOn: string;
    indexableOff: string;
    indexableClear: string;
    save: string;
  };
}

const UK: OperatorCatalogCopy = {
  queue: {
    metadataTitle: "Черга рішень каталогу",
    title: "Черга рішень каталогу",
    description:
      "Одне рішення за раз, найважливіше згори. Кожна пропозиція показує, що саме зміниться і чому.",
    empty: "Немає відкритих рішень. Усе, що можна було вирішити автоматично, вже вирішено.",
    open: "Відкриті рішення",
    impact: "Вплив",
    confidence: "Впевненість",
    reasons: "Підстави",
    filterAll: "Усі типи",
    itemTypes: {
      label_link: "Назва садівника",
      node_merge: "Об'єднання карток",
      source_link: "Зв'язок із джерелом",
      split_review: "Перегляд поділу",
    },
    subject: "Що змінюється",
    target: "На що",
    label: "Назва",
    objects: "об'єктів",
    entries: "записів",
    identifiers: "ідентифікатори",
    accept: "Так",
    reject: "Ні",
    skip: "Пропустити",
    undo: "Скасувати",
    previousItem: "Попереднє",
    nextItem: "Наступне",
    position: "Рішення",
    keyboardHint:
      "Клавіші: Y — так, N — ні, J — наступне, K — попереднє, U — скасувати.",
    confirmMerge: "Підтвердити об'єднання",
    confirmMergeHint:
      "Ця картка несе понад 50 об'єктів садівників. Підтвердьте, щоб об'єднати.",
    automatic: "Застосовано автоматично за тиждень",
    automaticEmpty: "За тиждень нічого не застосовано автоматично.",
    automaticHint: "Кожне з них можна скасувати одним рухом.",
    reverted: "скасовано",
    appliedAt: "Застосовано",
  },
  sources: {
    metadataTitle: "Джерела каталогу",
    title: "Джерела каталогу",
    description:
      "Одна картка на джерело: версія, ліцензія, скільки записів прив'язано і коли останній раз оновлювали.",
    empty: "Жодного джерела ще не завантажено.",
    version: "Версія",
    license: "Ліцензія",
    fetchedAt: "Завантажено",
    records: "записів",
    linked: "прив'язано",
    identifiers: "ідентифікаторів",
    assertions: "тверджень",
    refresh: "Оновити",
    refreshQueued: "Оновлення в черзі",
    lastRefresh: "Останнє оновлення",
    attribution: "Зазначення джерела",
    openSource: "Відкрити джерело",
    cadence: "Оновлюють",
    cadenceNames: {
      twice_a_year: "двічі на рік",
      as_released: "коли виходить нове видання",
    },
  },
  health: {
    title: "Чи працює вибір",
    description:
      "Що відбувається, коли садівник шукає рослину: скільки разів знайшов, скільки разів написав свою назву, скільки разів пішов ні з чим.",
    empty: "Ще жодного вибору не виміряно.",
    window: { "7": "За тиждень", "30": "За місяць" },
    attempts: "спроб",
    pickSuccess: "Знайшли в каталозі",
    ownLabel: "Написали свою назву",
    abandoned: "Пішли ні з чим",
    medianTimeToPick: "Медіанний час вибору",
    p95TimeToPick: "P95 часу вибору",
    notMeasured: "не виміряно",
    misses: "Чого шукали і не знайшли",
    missesHint: "Найчастіші запити без результату. Кожен можна перетворити на рішення.",
    missesEmpty: "Немає невирішених запитів без результату.",
    makeQueueItem: "У чергу рішень",
    occurrences: "разів",
    precision: "Точність автоматичних рішень",
    precisionHint: "Скасовані до застосованих за 30 днів, за правилом.",
    precisionEmpty: "За 30 днів автоматичних рішень не було.",
    applied: "застосовано",
    reverted: "скасовано",
    queueAge: "Вік найстарішого відкритого рішення",
    queueAgeEmpty: "Черга порожня.",
    days: "дн.",
  },
  card: {
    ownerTools: "Інструменти власника",
    rename: "Перейменувати",
    renameHint: "Додає назву і закріплює її як основну.",
    newName: "Нова назва",
    reason: "Причина",
    pinName: "Закріпити назву",
    pinNameHint: "Обрана назва стає тією, яку показує картка.",
    merge: "Об'єднати з іншою карткою",
    mergeHint:
      "Ця картка стане синонімом обраної: об'єкти, назви й ідентифікатори переїдуть.",
    mergeTarget: "Адреса або ідентифікатор картки",
    mergeConfirm: "Підтвердити об'єднання",
    audit: "Що вже зроблено з карткою",
    auditEmpty: "Ще нічого.",
    undo: "Скасувати",
    reverted: "скасовано",
    indexable: "Індексація",
    indexableOn: "Дозволити",
    indexableOff: "Заборонити",
    indexableClear: "За правилом",
    save: "Зберегти",
  },
};

const BG: OperatorCatalogCopy = {
  queue: {
    metadataTitle: "Опашка с решения за каталога",
    title: "Опашка с решения за каталога",
    description:
      "Едно решение наведнъж, най-важното отгоре. Всяко предложение показва какво точно се променя и защо.",
    empty: "Няма отворени решения. Всичко, което можеше да се реши автоматично, е решено.",
    open: "Отворени решения",
    impact: "Влияние",
    confidence: "Увереност",
    reasons: "Основания",
    filterAll: "Всички видове",
    itemTypes: {
      label_link: "Име на градинар",
      node_merge: "Сливане на карти",
      source_link: "Връзка с източник",
      split_review: "Преглед на разделяне",
    },
    subject: "Какво се променя",
    target: "В какво",
    label: "Име",
    objects: "обекта",
    entries: "записа",
    identifiers: "идентификатори",
    accept: "Да",
    reject: "Не",
    skip: "Пропусни",
    undo: "Отмени",
    previousItem: "Предишно",
    nextItem: "Следващо",
    position: "Решение",
    keyboardHint:
      "Клавиши: Y — да, N — не, J — следващо, K — предишно, U — отмени.",
    confirmMerge: "Потвърдете сливането",
    confirmMergeHint:
      "Тази карта носи над 50 обекта на градинари. Потвърдете, за да слеете.",
    automatic: "Приложено автоматично тази седмица",
    automaticEmpty: "Тази седмица нищо не е приложено автоматично.",
    automaticHint: "Всяко от тях се отменя с едно движение.",
    reverted: "отменено",
    appliedAt: "Приложено",
  },
  sources: {
    metadataTitle: "Източници на каталога",
    title: "Източници на каталога",
    description:
      "По една карта на източник: версия, лиценз, колко записа са свързани и кога е обновяван последно.",
    empty: "Още няма зареден източник.",
    version: "Версия",
    license: "Лиценз",
    fetchedAt: "Изтеглено",
    records: "записа",
    linked: "свързани",
    identifiers: "идентификатора",
    assertions: "твърдения",
    refresh: "Обнови",
    refreshQueued: "Обновяването е в опашка",
    lastRefresh: "Последно обновяване",
    attribution: "Посочване на източника",
    openSource: "Отвори източника",
    cadence: "Обновява се",
    cadenceNames: {
      twice_a_year: "два пъти годишно",
      as_released: "когато излезе ново издание",
    },
  },
  health: {
    title: "Работи ли изборът",
    description:
      "Какво става, когато градинар търси растение: колко пъти е намерил, колко пъти е написал свое име, колко пъти си е тръгнал с нищо.",
    empty: "Още нито един избор не е измерен.",
    window: { "7": "За седмица", "30": "За месец" },
    attempts: "опита",
    pickSuccess: "Намерени в каталога",
    ownLabel: "Написали свое име",
    abandoned: "Тръгнали си с нищо",
    medianTimeToPick: "Медианно време за избор",
    p95TimeToPick: "P95 на времето за избор",
    notMeasured: "не е измерено",
    misses: "Какво са търсили и не са намерили",
    missesHint: "Най-честите заявки без резултат. Всяка може да стане решение.",
    missesEmpty: "Няма нерешени заявки без резултат.",
    makeQueueItem: "В опашката с решения",
    occurrences: "пъти",
    precision: "Точност на автоматичните решения",
    precisionHint: "Отменени спрямо приложени за 30 дни, по правило.",
    precisionEmpty: "За 30 дни няма автоматични решения.",
    applied: "приложени",
    reverted: "отменени",
    queueAge: "Възраст на най-старото отворено решение",
    queueAgeEmpty: "Опашката е празна.",
    days: "дни",
  },
  card: {
    ownerTools: "Инструменти на собственика",
    rename: "Преименувай",
    renameHint: "Добавя име и го закача като основно.",
    newName: "Ново име",
    reason: "Причина",
    pinName: "Закачи име",
    pinNameHint: "Избраното име става това, което картата показва.",
    merge: "Обедини с друга карта",
    mergeHint:
      "Тази карта става синоним на избраната: обектите, имената и идентификаторите се преместват.",
    mergeTarget: "Адрес или идентификатор на картата",
    mergeConfirm: "Потвърди обединяването",
    audit: "Какво е направено с картата",
    auditEmpty: "Още нищо.",
    undo: "Отмени",
    reverted: "отменено",
    indexable: "Индексиране",
    indexableOn: "Позволи",
    indexableOff: "Забрани",
    indexableClear: "По правилото",
    save: "Запази",
  },
};

const RU: OperatorCatalogCopy = {
  queue: {
    metadataTitle: "Очередь решений каталога",
    title: "Очередь решений каталога",
    description:
      "Одно решение за раз, самое важное сверху. Каждое предложение показывает, что именно изменится и почему.",
    empty: "Нет открытых решений. Всё, что можно было решить автоматически, уже решено.",
    open: "Открытые решения",
    impact: "Влияние",
    confidence: "Уверенность",
    reasons: "Основания",
    filterAll: "Все типы",
    itemTypes: {
      label_link: "Название садовода",
      node_merge: "Объединение карточек",
      source_link: "Связь с источником",
      split_review: "Просмотр разделения",
    },
    subject: "Что меняется",
    target: "На что",
    label: "Название",
    objects: "объектов",
    entries: "записей",
    identifiers: "идентификаторы",
    accept: "Да",
    reject: "Нет",
    skip: "Пропустить",
    undo: "Отменить",
    previousItem: "Предыдущее",
    nextItem: "Следующее",
    position: "Решение",
    keyboardHint:
      "Клавиши: Y — да, N — нет, J — следующее, K — предыдущее, U — отменить.",
    confirmMerge: "Подтвердить объединение",
    confirmMergeHint:
      "Эта карточка несёт более 50 объектов садоводов. Подтвердите, чтобы объединить.",
    automatic: "Применено автоматически за неделю",
    automaticEmpty: "За неделю ничего не применено автоматически.",
    automaticHint: "Каждое из них отменяется одним движением.",
    reverted: "отменено",
    appliedAt: "Применено",
  },
  sources: {
    metadataTitle: "Источники каталога",
    title: "Источники каталога",
    description:
      "По одной карточке на источник: версия, лицензия, сколько записей связано и когда обновляли в последний раз.",
    empty: "Ни один источник ещё не загружен.",
    version: "Версия",
    license: "Лицензия",
    fetchedAt: "Загружено",
    records: "записей",
    linked: "связано",
    identifiers: "идентификаторов",
    assertions: "утверждений",
    refresh: "Обновить",
    refreshQueued: "Обновление в очереди",
    lastRefresh: "Последнее обновление",
    attribution: "Указание источника",
    openSource: "Открыть источник",
    cadence: "Обновляют",
    cadenceNames: {
      twice_a_year: "дважды в год",
      as_released: "когда выходит новое издание",
    },
  },
  health: {
    title: "Работает ли выбор",
    description:
      "Что происходит, когда садовод ищет растение: сколько раз нашёл, сколько раз написал своё название, сколько раз ушёл ни с чем.",
    empty: "Ещё ни один выбор не измерен.",
    window: { "7": "За неделю", "30": "За месяц" },
    attempts: "попыток",
    pickSuccess: "Нашли в каталоге",
    ownLabel: "Написали своё название",
    abandoned: "Ушли ни с чем",
    medianTimeToPick: "Медианное время выбора",
    p95TimeToPick: "P95 времени выбора",
    notMeasured: "не измерено",
    misses: "Что искали и не нашли",
    missesHint: "Самые частые запросы без результата. Каждый можно превратить в решение.",
    missesEmpty: "Нет нерешённых запросов без результата.",
    makeQueueItem: "В очередь решений",
    occurrences: "раз",
    precision: "Точность автоматических решений",
    precisionHint: "Отменённые к применённым за 30 дней, по правилу.",
    precisionEmpty: "За 30 дней автоматических решений не было.",
    applied: "применено",
    reverted: "отменено",
    queueAge: "Возраст самого старого открытого решения",
    queueAgeEmpty: "Очередь пуста.",
    days: "дн.",
  },
  card: {
    ownerTools: "Инструменты владельца",
    rename: "Переименовать",
    renameHint: "Добавляет название и закрепляет его как основное.",
    newName: "Новое название",
    reason: "Причина",
    pinName: "Закрепить название",
    pinNameHint: "Выбранное название становится тем, что показывает карточка.",
    merge: "Объединить с другой карточкой",
    mergeHint:
      "Эта карточка станет синонимом выбранной: объекты, названия и идентификаторы переедут.",
    mergeTarget: "Адрес или идентификатор карточки",
    mergeConfirm: "Подтвердить объединение",
    audit: "Что уже сделано с карточкой",
    auditEmpty: "Пока ничего.",
    undo: "Отменить",
    reverted: "отменено",
    indexable: "Индексация",
    indexableOn: "Разрешить",
    indexableOff: "Запретить",
    indexableClear: "По правилу",
    save: "Сохранить",
  },
};

const COPY_BY_LOCALE = { uk: UK, bg: BG, ru: RU } satisfies Record<
  InterfaceLocale,
  OperatorCatalogCopy
>;

export function getOperatorCatalogCopy(
  locale: InterfaceLocale,
): OperatorCatalogCopy {
  return COPY_BY_LOCALE[locale];
}
