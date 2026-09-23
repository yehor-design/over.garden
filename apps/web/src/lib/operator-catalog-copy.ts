import type { CatalogSourceRefreshCadence } from "@/lib/catalog/source-cadence";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { CurationBlock } from "@/lib/catalog/curation-queue";

/**
 * The owner's two curation surfaces (ADR-0026 D10): the decision queue and
 * the sources page. Every string a curator reads lives here in the three
 * interface languages; nothing on these pages is a gardener's words.
 *
 * `OVE-506` rebuilt both as work queues: a table of what is open, a detail
 * pane for the one decision on screen, and every figure with the sample it
 * rests on. The machine's words — rule codes, item types, job states — are
 * named here in the reader's language and shown raw only as a secondary line.
 */

/** A noun that agrees with its number, per `Intl.PluralRules`. */
export interface CountForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export type OperatorCatalogQueueItemType =
  | "label_link"
  | "node_merge"
  | "source_link"
  | "split_review";

export interface OperatorCatalogCopy {
  /** Who may open these pages, and what a page says when it cannot tell. */
  access: {
    deniedTitle: string;
    deniedBody: string;
    /** A role table that could not be read is an outage, never a refusal. */
    unavailableTitle: string;
  };
  /** When this page read what it shows. */
  readAt: string;
  units: {
    objects: CountForms;
    entries: CountForms;
    days: CountForms;
    attempts: CountForms;
    measurements: CountForms;
    times: CountForms;
    records: CountForms;
    identifiers: CountForms;
    assertions: CountForms;
    decisions: CountForms;
  };
  /** The reconciliation ladder's reason codes, in words. */
  reasons: {
    names: Readonly<Record<string, string>>;
    /** `shared_identifier:{scheme}`. */
    sharedIdentifier: string;
    /** `{scheme}_identifier_conflict`. */
    identifierConflict: string;
    /** A code this page has no words for yet. */
    unknown: string;
  };
  queue: {
    metadataTitle: string;
    title: string;
    description: string;
    empty: string;
    emptyFiltered: string;
    summary: string;
    summaryOldest: string;
    shown: string;
    filterLabel: string;
    filterAll: string;
    itemTypes: Record<OperatorCatalogQueueItemType, string>;
    decisionHeading: string;
    listHeading: string;
    listCaption: string;
    columns: {
      identity: string;
      reason: string;
      state: string;
      impact: string;
      action: string;
    };
    review: string;
    reviewLabel: string;
    reviewing: string;
    states: { ready: string; confirm: string; blocked: string };
    blocked: Record<CurationBlock, string>;
    impact: string;
    confidence: string;
    reasons: string;
    subject: string;
    target: string;
    label: string;
    identifiers: string;
    openCard: string;
    accept: string;
    reject: string;
    skip: string;
    previousItem: string;
    nextItem: string;
    position: string;
    /**
     * The heading over the key list. The keys themselves are not prose
     * (`OVE-459` AC2): a shortcut a reader has to parse out of a sentence is
     * a shortcut they will not use.
     */
    keyboardHint: string;
    /** What each key does, beside the key itself. */
    keys: {
      accept: string;
      reject: string;
      next: string;
      previous: string;
      undo: string;
    };
    /**
     * Single-letter keys can be switched off (WCAG 2.1.4): a screen-reader
     * user's own letter commands must not decide a queue item.
     */
    shortcutsOn: string;
    shortcutsOff: string;
    shortcutsTurnOff: string;
    shortcutsTurnOn: string;
    confirmMerge: string;
    /** Names `{objects}` — this merge's own objects, not the rule's fifty. */
    confirmMergeHint: string;
    createdAt: string;
    outcome: {
      accepted: string;
      rejected: string;
      skipped: string;
      reverted: string;
      stale: string;
      failed: string;
      confirm: string;
      denied: string;
    };
  };
  automatic: {
    heading: string;
    hint: string;
    empty: string;
    caption: string;
    columns: {
      what: string;
      rule: string;
      when: string;
      state: string;
      action: string;
    };
    applied: string;
    reverted: string;
    undo: string;
    undoLabel: string;
  };
  sources: {
    metadataTitle: string;
    title: string;
    description: string;
    empty: string;
    heading: string;
    caption: string;
    columns: {
      source: string;
      freshness: string;
      coverage: string;
      action: string;
    };
    version: string;
    license: string;
    attribution: string;
    snapshot: string;
    verified: string;
    rejectedAfter: string;
    cadence: string;
    cadenceNames: Record<CatalogSourceRefreshCadence, string>;
    refreshStates: {
      none: string;
      pending: string;
      processing: string;
      done: string;
      failed: string;
      dead: string;
    };
    refresh: string;
    refreshLabel: string;
    linkedShare: string;
    coverageFailed: string;
    coverageRetry: string;
    outcome: {
      queued: string;
      failed: string;
      denied: string;
      unknownSource: string;
    };
  };
  /** ADR-0026 D12: the catalog's own numbers, where the owner already works. */
  health: {
    title: string;
    description: string;
    empty: string;
    caption: string;
    metric: string;
    window: Record<"7" | "30", string>;
    windowRange: string;
    attempts: string;
    pickSuccess: string;
    ownLabel: string;
    abandoned: string;
    share: string;
    medianTimeToPick: string;
    p95TimeToPick: string;
    measured: string;
    insufficient: string;
    notMeasured: string;
    sampleRule: string;
    misses: string;
    missesHint: string;
    missesEmpty: string;
    missesCaption: string;
    missesColumns: {
      query: string;
      times: string;
      lastSeen: string;
      action: string;
    };
    makeQueueItem: string;
    makeQueueItemLabel: string;
    missOutcome: { queued: string; failed: string; denied: string };
    openQueueItem: string;
    precision: string;
    precisionHint: string;
    precisionEmpty: string;
    precisionCaption: string;
    precisionColumns: {
      rule: string;
      applied: string;
      reverted: string;
      share: string;
    };
    unplaced: string;
    unplacedHint: string;
    unplacedEmpty: string;
    unplacedCaption: string;
    unplacedColumns: { source: string; records: string; oldest: string };
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
  access: {
    deniedTitle: "Лише для власника каталогу",
    deniedBody:
      "Черга рішень і джерела каталогу відкриті тільки власникові. Ваш обліковий запис їх не бачить.",
    unavailableTitle: "Не вдалося перевірити доступ",
  },
  readAt: "Прочитано {time}",
  units: {
    objects: {
      one: "об'єкт",
      few: "об'єкти",
      many: "об'єктів",
      other: "об'єкта",
    },
    entries: { one: "запис", few: "записи", many: "записів", other: "запису" },
    days: { one: "день", few: "дні", many: "днів", other: "дня" },
    attempts: { one: "спроба", few: "спроби", many: "спроб", other: "спроби" },
    measurements: {
      one: "вимір",
      few: "виміри",
      many: "вимірів",
      other: "виміру",
    },
    times: { one: "раз", few: "рази", many: "разів", other: "раза" },
    records: { one: "запис", few: "записи", many: "записів", other: "запису" },
    identifiers: {
      one: "ідентифікатор",
      few: "ідентифікатори",
      many: "ідентифікаторів",
      other: "ідентифікатора",
    },
    assertions: {
      one: "твердження",
      few: "твердження",
      many: "тверджень",
      other: "твердження",
    },
    decisions: {
      one: "рішення",
      few: "рішення",
      many: "рішень",
      other: "рішення",
    },
  },
  reasons: {
    names: {
      shared_identifier: "Спільний зовнішній ідентифікатор",
      exact_scientific_authorship: "Та сама наукова назва й автор",
      canonical_same_kingdom_rank: "Та сама наукова назва, царство й ранг",
      fuzzy_same_genus: "Майже та сама назва в тому ж роді",
      denomination_equal: "Та сама назва сорту чи породи",
      denomination_transliteration:
        "Та сама назва сорту в іншій транслітерації",
      co_usage: "Садівники вживають обидві назви",
      label_scientific_name: "Назва садівника — наукова назва",
      label_scientific_synonym: "Назва садівника — синонім наукової назви",
      homonym_kingdom_conflict: "Та сама назва в іншому царстві",
      search_miss: "Садівники шукали й не знайшли",
      eppo_ladder: "Запис EPPO збігся з карткою",
      eppo_facts: "Факти з EPPO",
      eppo_ambiguous: "Запис EPPO підходить кільком карткам",
      eppo_unmatched: "Запис EPPO не знайшов картки",
      register_species_unmatched: "Вид сорту з реєстру не знайдено",
      col_shared_identifier:
        "Той самий ідентифікатор Catalogue of Life на двох картках",
      col_accepted_became_synonym:
        "Catalogue of Life тепер вважає назву синонімом",
      col_unmatched: "Catalogue of Life не знайшов цієї картки",
      col_materialize: "Картка з Catalogue of Life",
      col_materialize_existing: "Картка з Catalogue of Life",
      col_refresh: "Оновлення з Catalogue of Life",
      legacy_source_link: "Давній зв'язок із джерелом",
      wikidata_crosswalk: "Зіставлення з Wikidata",
      merge_from_card: "Об'єднання, запропоноване на картці",
    },
    sharedIdentifier: "Той самий ідентифікатор {scheme}",
    identifierConflict: "Ідентифікатор {scheme} уже має інша картка",
    unknown: "Правило без назви",
  },
  queue: {
    metadataTitle: "Черга рішень каталогу",
    title: "Черга рішень каталогу",
    description:
      "Одне рішення за раз, найважливіше згори. Кожна пропозиція показує, що саме зміниться і чому.",
    empty:
      "Немає відкритих рішень. Усе, що можна було вирішити автоматично, вже вирішено.",
    emptyFiltered: "Відкритих рішень цього типу немає.",
    summary: "Відкрито {count}",
    summaryOldest: "найстарішому {age}",
    shown: "Показано перші {shown} з {total}, за впливом.",
    filterLabel: "Тип рішення",
    filterAll: "Усі типи",
    itemTypes: {
      label_link: "Назва садівника",
      node_merge: "Об'єднання карток",
      source_link: "Зв'язок із джерелом",
      split_review: "Перегляд поділу",
    },
    decisionHeading: "Поточне рішення",
    listHeading: "Відкриті рішення",
    listCaption: "Відкриті рішення, найбільший вплив згори",
    columns: {
      identity: "Що",
      reason: "Чому",
      state: "Стан",
      impact: "Вплив",
      action: "Дія",
    },
    review: "Переглянути",
    reviewLabel: "Переглянути: {name}",
    reviewing: "На екрані",
    states: {
      ready: "Можна вирішити",
      confirm: "Потрібне підтвердження",
      blocked: "Прийняти не можна",
    },
    blocked: {
      no_target:
        "Немає картки, до якої це прив'язати, тож прийняти нема що. Відхиліть або пропустіть.",
      target_inactive:
        "Картку, яку воно називає, вже об'єднано або прибрано. Прийняти не вийде.",
      not_applied_here:
        "Поділ картки не застосовується з черги — його переглядають на самій картці.",
    },
    impact: "Вплив",
    confidence: "Впевненість",
    reasons: "Підстави",
    subject: "Що змінюється",
    target: "На що",
    label: "Назва садівника",
    identifiers: "Ідентифікатори",
    openCard: "Відкрити картку",
    accept: "Прийняти",
    reject: "Відхилити",
    skip: "Пропустити",
    previousItem: "Попереднє",
    nextItem: "Наступне",
    position: "Рішення {index} з {count}",
    keyboardHint: "З клавіатури",
    keys: {
      accept: "Прийняти",
      reject: "Відхилити",
      next: "Наступне рішення",
      previous: "Попереднє рішення",
      undo: "Скасувати останню автоматичну дію",
    },
    shortcutsOn: "Клавіші діють",
    shortcutsOff: "Клавіші вимкнено",
    shortcutsTurnOff: "Вимкнути клавіші",
    shortcutsTurnOn: "Увімкнути клавіші",
    confirmMerge: "Підтвердити об'єднання",
    confirmMergeHint:
      "Це об'єднання перенесе {objects} садівників. Підтвердьте, щоб продовжити.",
    createdAt: "Запропоновано {date}",
    outcome: {
      accepted: "Прийнято: {name}.",
      rejected: "Відхилено: {name}.",
      skipped:
        "Пропущено: {name}. Рішення не записано, і в черзі його більше немає.",
      reverted: "Автоматичну дію скасовано: {name}.",
      stale: "{name} уже вирішено раніше — нічого не змінено.",
      failed: "Не вдалося: {name}. Нічого не змінено — спробуйте ще раз.",
      confirm:
        "Відтоді, як ви відкрили це рішення, об'єктів стало більше. Перевірте кількість і підтвердьте ще раз.",
      denied: "Вирішувати тут може лише власник каталогу. Нічого не змінено.",
    },
  },
  automatic: {
    heading: "Застосовано автоматично за тиждень",
    hint: "Кожне з них можна скасувати одним рухом.",
    empty: "За тиждень нічого не застосовано автоматично.",
    caption: "Автоматичні рішення за сім днів, найновіші згори",
    columns: {
      what: "Що",
      rule: "Правило",
      when: "Коли",
      state: "Стан",
      action: "Дія",
    },
    applied: "Діє",
    reverted: "Скасовано",
    undo: "Скасувати",
    undoLabel: "Скасувати: {name}",
  },
  sources: {
    metadataTitle: "Джерела каталогу",
    title: "Джерела каталогу",
    description:
      "Звідки каталог знає те, що знає: версія, ліцензія, скільки записів дійшло до карток і коли джерело оновлювали.",
    empty: "Жодного джерела ще не завантажено.",
    heading: "Джерела",
    caption: "Джерела каталогу за назвою",
    columns: {
      source: "Джерело",
      freshness: "Свіжість",
      coverage: "Покриття",
      action: "Дія",
    },
    version: "Версія {version}",
    license: "Ліцензія: {license}",
    attribution: "Зазначення джерела",
    snapshot: "Знімок від {date}",
    verified: "перевірено {date}",
    rejectedAfter: "Новіший знімок від {date} відхилено — показано попередній.",
    cadence: "Оновлюють {cadence}",
    cadenceNames: {
      twice_a_year: "двічі на рік",
      as_released: "коли виходить нове видання",
    },
    refreshStates: {
      none: "Звідси ще не оновлювали.",
      pending: "Оновлення в черзі з {date}.",
      processing: "Оновлюється з {date}.",
      done: "Останнє оновлення завершено {date}.",
      failed: "Оновлення {date} не вдалося — буде ще спроба.",
      dead: "Оновлення {date} не вдалося.",
    },
    refresh: "Оновити",
    refreshLabel: "Оновити: {source}",
    linkedShare: "Прив'язано до карток: {linked} з {records} ({share}%)",
    coverageFailed: "Не вдалося порахувати записи цього джерела.",
    coverageRetry: "Повторити",
    outcome: {
      queued: "Оновлення поставлено в чергу: {source}.",
      failed:
        "Не вдалося поставити оновлення в чергу: {source}. Спробуйте ще раз.",
      denied:
        "Оновлювати джерела може лише власник каталогу. Нічого не змінено.",
      unknownSource: "Такого джерела немає — нічого не змінено.",
    },
  },
  health: {
    title: "Чи працює вибір",
    description:
      "Що відбувається, коли садівник шукає рослину: скільки разів знайшов, скільки разів написав свою назву, скільки разів пішов ні з чим.",
    empty: "Ще жодного вибору не виміряно.",
    caption: "Вибір у каталозі за тиждень і за місяць",
    metric: "Показник",
    window: { "7": "Тиждень", "30": "Місяць" },
    windowRange: "{from} – {to}",
    attempts: "Спроби",
    pickSuccess: "Знайшли в каталозі",
    ownLabel: "Написали свою назву",
    abandoned: "Пішли ні з чим",
    share: "{part} з {whole}",
    medianTimeToPick: "Медіанний час вибору",
    p95TimeToPick: "P95 часу вибору",
    measured: "{value} · {sample}",
    insufficient: "Замало вимірів: {sample} з {needed}",
    notMeasured: "Не виміряно",
    sampleRule:
      "Медіану показано від {median} вимірів, P95 — від {p95}, частки у відсотках — від {share} спроб. Менше — це ще не статистика.",
    misses: "Чого шукали і не знайшли",
    missesHint:
      "Найчастіші запити без результату. Кожен можна перетворити на рішення.",
    missesEmpty: "Немає невирішених запитів без результату.",
    missesCaption: "Запити без результату, найчастіші згори",
    missesColumns: {
      query: "Запит",
      times: "Скільки разів",
      lastSeen: "Востаннє",
      action: "Дія",
    },
    makeQueueItem: "У чергу рішень",
    makeQueueItemLabel: "У чергу рішень: {query}",
    missOutcome: {
      queued: "Додано в чергу рішень: {query}.",
      failed: "Не вдалося додати в чергу рішень — спробуйте ще раз.",
      denied: "Додавати рішення може лише власник каталогу. Нічого не змінено.",
    },
    openQueueItem: "Відкрити в черзі",
    precision: "Точність автоматичних рішень",
    precisionHint:
      "Скільки автоматичних рішень за 30 днів потім скасували, за правилом. Правило, чиї рішення часто скасовують, застосовується надто сміливо.",
    precisionEmpty: "За 30 днів автоматичних рішень не було.",
    precisionCaption: "Автоматичні рішення за 30 днів, за правилом",
    precisionColumns: {
      rule: "Правило",
      applied: "Застосовано",
      reverted: "Скасовано",
      share: "Частка скасованих",
    },
    unplaced: "Записи джерел, яким немає місця в графі",
    unplacedHint:
      "Джерело знає організм, для якого каталог не створює картку: рід, родина, або запис без царства. Це покриття, а не рішення — каталог моделює вид і нижче.",
    unplacedEmpty: "Усі записи джерел розміщено.",
    unplacedCaption: "Нерозміщені записи за джерелом",
    unplacedColumns: {
      source: "Джерело",
      records: "Записів",
      oldest: "Найстарішому",
    },
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
  access: {
    deniedTitle: "Само за собственика на каталога",
    deniedBody:
      "Опашката с решения и източниците на каталога са отворени само за собственика. Вашият профил не ги вижда.",
    unavailableTitle: "Достъпът не можа да бъде проверен",
  },
  readAt: "Прочетено {time}",
  units: {
    objects: { one: "обект", other: "обекта" },
    entries: { one: "запис", other: "записа" },
    days: { one: "ден", other: "дни" },
    attempts: { one: "опит", other: "опита" },
    measurements: { one: "измерване", other: "измервания" },
    times: { one: "път", other: "пъти" },
    records: { one: "запис", other: "записа" },
    identifiers: { one: "идентификатор", other: "идентификатора" },
    assertions: { one: "твърдение", other: "твърдения" },
    decisions: { one: "решение", other: "решения" },
  },
  reasons: {
    names: {
      shared_identifier: "Общ външен идентификатор",
      exact_scientific_authorship: "Същото научно име и автор",
      canonical_same_kingdom_rank: "Същото научно име, царство и ранг",
      fuzzy_same_genus: "Почти същото име в същия род",
      denomination_equal: "Същото име на сорт или порода",
      denomination_transliteration: "Същото име на сорт в друга транслитерация",
      co_usage: "Градинарите използват и двете имена",
      label_scientific_name: "Името на градинаря е научно име",
      label_scientific_synonym: "Името на градинаря е синоним на научно име",
      homonym_kingdom_conflict: "Същото име в друго царство",
      search_miss: "Градинарите са търсили и не са намерили",
      eppo_ladder: "Запис от EPPO съвпадна с карта",
      eppo_facts: "Факти от EPPO",
      eppo_ambiguous: "Запис от EPPO пасва на няколко карти",
      eppo_unmatched: "Запис от EPPO не намери карта",
      register_species_unmatched: "Видът на сорта от регистъра не е намерен",
      col_shared_identifier:
        "Един и същ идентификатор от Catalogue of Life на две карти",
      col_accepted_became_synonym:
        "Catalogue of Life вече смята името за синоним",
      col_unmatched: "Catalogue of Life не намери тази карта",
      col_materialize: "Карта от Catalogue of Life",
      col_materialize_existing: "Карта от Catalogue of Life",
      col_refresh: "Обновяване от Catalogue of Life",
      legacy_source_link: "Стара връзка с източник",
      wikidata_crosswalk: "Съпоставяне с Wikidata",
      merge_from_card: "Сливане, предложено от картата",
    },
    sharedIdentifier: "Същият идентификатор от {scheme}",
    identifierConflict: "Идентификаторът от {scheme} вече е на друга карта",
    unknown: "Правило без име",
  },
  queue: {
    metadataTitle: "Опашка с решения за каталога",
    title: "Опашка с решения за каталога",
    description:
      "Едно решение наведнъж, най-важното отгоре. Всяко предложение показва какво точно се променя и защо.",
    empty:
      "Няма отворени решения. Всичко, което можеше да се реши автоматично, е решено.",
    emptyFiltered: "Няма отворени решения от този вид.",
    summary: "Отворени: {count}",
    summaryOldest: "най-старото е на {age}",
    shown: "Показани са първите {shown} от {total}, по влияние.",
    filterLabel: "Вид решение",
    filterAll: "Всички видове",
    itemTypes: {
      label_link: "Име на градинар",
      node_merge: "Сливане на карти",
      source_link: "Връзка с източник",
      split_review: "Преглед на разделяне",
    },
    decisionHeading: "Текущо решение",
    listHeading: "Отворени решения",
    listCaption: "Отворени решения, най-голямото влияние отгоре",
    columns: {
      identity: "Какво",
      reason: "Защо",
      state: "Състояние",
      impact: "Влияние",
      action: "Действие",
    },
    review: "Прегледай",
    reviewLabel: "Прегледай: {name}",
    reviewing: "На екрана",
    states: {
      ready: "Може да се реши",
      confirm: "Нужно е потвърждение",
      blocked: "Не може да се приеме",
    },
    blocked: {
      no_target:
        "Няма карта, към която да се свърже, така че няма какво да се приеме. Отхвърлете или пропуснете.",
      target_inactive:
        "Картата, която назовава, вече е слята или премахната. Приемането няма да успее.",
      not_applied_here:
        "Разделянето на карта не се прилага от опашката — преглежда се на самата карта.",
    },
    impact: "Влияние",
    confidence: "Увереност",
    reasons: "Основания",
    subject: "Какво се променя",
    target: "В какво",
    label: "Име на градинар",
    identifiers: "Идентификатори",
    openCard: "Отвори картата",
    accept: "Приеми",
    reject: "Отхвърли",
    skip: "Пропусни",
    previousItem: "Предишно",
    nextItem: "Следващо",
    position: "Решение {index} от {count}",
    keyboardHint: "От клавиатурата",
    keys: {
      accept: "Приеми",
      reject: "Отхвърли",
      next: "Следващо решение",
      previous: "Предишно решение",
      undo: "Отмени последното автоматично действие",
    },
    shortcutsOn: "Клавишите работят",
    shortcutsOff: "Клавишите са изключени",
    shortcutsTurnOff: "Изключи клавишите",
    shortcutsTurnOn: "Включи клавишите",
    confirmMerge: "Потвърдете сливането",
    confirmMergeHint:
      "Това сливане ще премести {objects} на градинари. Потвърдете, за да продължите.",
    createdAt: "Предложено {date}",
    outcome: {
      accepted: "Прието: {name}.",
      rejected: "Отхвърлено: {name}.",
      skipped:
        "Пропуснато: {name}. Решение не е записано и вече го няма в опашката.",
      reverted: "Автоматичното действие е отменено: {name}.",
      stale: "{name} вече е решено — нищо не е променено.",
      failed: "Неуспешно: {name}. Нищо не е променено — опитайте отново.",
      confirm:
        "Откакто отворихте това решение, обектите са станали повече. Проверете броя и потвърдете отново.",
      denied: "Тук решава само собственикът на каталога. Нищо не е променено.",
    },
  },
  automatic: {
    heading: "Приложено автоматично тази седмица",
    hint: "Всяко от тях се отменя с едно движение.",
    empty: "Тази седмица нищо не е приложено автоматично.",
    caption: "Автоматични решения за седем дни, най-новите отгоре",
    columns: {
      what: "Какво",
      rule: "Правило",
      when: "Кога",
      state: "Състояние",
      action: "Действие",
    },
    applied: "В сила",
    reverted: "Отменено",
    undo: "Отмени",
    undoLabel: "Отмени: {name}",
  },
  sources: {
    metadataTitle: "Източници на каталога",
    title: "Източници на каталога",
    description:
      "Откъде каталогът знае това, което знае: версия, лиценз, колко записа са стигнали до картите и кога източникът е обновяван.",
    empty: "Още няма зареден източник.",
    heading: "Източници",
    caption: "Източници на каталога по име",
    columns: {
      source: "Източник",
      freshness: "Актуалност",
      coverage: "Покритие",
      action: "Действие",
    },
    version: "Версия {version}",
    license: "Лиценз: {license}",
    attribution: "Посочване на източника",
    snapshot: "Снимка от {date}",
    verified: "проверена {date}",
    rejectedAfter:
      "По-нова снимка от {date} е отхвърлена — показана е предишната.",
    cadence: "Обновява се {cadence}",
    cadenceNames: {
      twice_a_year: "два пъти годишно",
      as_released: "когато излезе ново издание",
    },
    refreshStates: {
      none: "Оттук още не е обновяван.",
      pending: "Обновяването чака в опашката от {date}.",
      processing: "Обновява се от {date}.",
      done: "Последното обновяване завърши {date}.",
      failed: "Обновяването от {date} не успя — ще има нов опит.",
      dead: "Обновяването от {date} не успя.",
    },
    refresh: "Обнови",
    refreshLabel: "Обнови: {source}",
    linkedShare: "Свързани с карти: {linked} от {records} ({share}%)",
    coverageFailed: "Записите на този източник не можаха да бъдат преброени.",
    coverageRetry: "Опитай отново",
    outcome: {
      queued: "Обновяването е в опашката: {source}.",
      failed:
        "Обновяването не можа да влезе в опашката: {source}. Опитайте отново.",
      denied:
        "Само собственикът на каталога обновява източници. Нищо не е променено.",
      unknownSource: "Няма такъв източник — нищо не е променено.",
    },
  },
  health: {
    title: "Работи ли изборът",
    description:
      "Какво става, когато градинар търси растение: колко пъти е намерил, колко пъти е написал свое име, колко пъти си е тръгнал с нищо.",
    empty: "Още нито един избор не е измерен.",
    caption: "Изборът в каталога за седмица и за месец",
    metric: "Показател",
    window: { "7": "Седмица", "30": "Месец" },
    windowRange: "{from} – {to}",
    attempts: "Опити",
    pickSuccess: "Намерени в каталога",
    ownLabel: "Написали свое име",
    abandoned: "Тръгнали си с нищо",
    share: "{part} от {whole}",
    medianTimeToPick: "Медианно време за избор",
    p95TimeToPick: "P95 на времето за избор",
    measured: "{value} · {sample}",
    insufficient: "Твърде малко измервания: {sample} от {needed}",
    notMeasured: "Не е измерено",
    sampleRule:
      "Медианата се показва от {median} измервания, P95 — от {p95}, дяловете в проценти — от {share} опита. По-малко още не е статистика.",
    misses: "Какво са търсили и не са намерили",
    missesHint: "Най-честите заявки без резултат. Всяка може да стане решение.",
    missesEmpty: "Няма нерешени заявки без резултат.",
    missesCaption: "Заявки без резултат, най-честите отгоре",
    missesColumns: {
      query: "Заявка",
      times: "Колко пъти",
      lastSeen: "Последно",
      action: "Действие",
    },
    makeQueueItem: "В опашката с решения",
    makeQueueItemLabel: "В опашката с решения: {query}",
    missOutcome: {
      queued: "Добавено в опашката с решения: {query}.",
      failed: "Не можа да се добави в опашката — опитайте отново.",
      denied:
        "Само собственикът на каталога добавя решения. Нищо не е променено.",
    },
    openQueueItem: "Отвори в опашката",
    precision: "Точност на автоматичните решения",
    precisionHint:
      "Колко автоматични решения за 30 дни са отменени после, по правило. Правило, чиито решения често се отменят, се прилага твърде смело.",
    precisionEmpty: "За 30 дни няма автоматични решения.",
    precisionCaption: "Автоматични решения за 30 дни, по правило",
    precisionColumns: {
      rule: "Правило",
      applied: "Приложени",
      reverted: "Отменени",
      share: "Дял на отменените",
    },
    unplaced: "Записи на източници без място в графа",
    unplacedHint:
      "Източникът познава организъм, за който каталогът не прави карта: род, семейство или запис без царство. Това е покритие, а не решение — каталогът моделира вид и по-долу.",
    unplacedEmpty: "Всички записи на източници са разположени.",
    unplacedCaption: "Неразположени записи по източник",
    unplacedColumns: {
      source: "Източник",
      records: "Записи",
      oldest: "Най-старият",
    },
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
  access: {
    deniedTitle: "Только для владельца каталога",
    deniedBody:
      "Очередь решений и источники каталога открыты только владельцу. Ваша учётная запись их не видит.",
    unavailableTitle: "Не удалось проверить доступ",
  },
  readAt: "Прочитано {time}",
  units: {
    objects: {
      one: "объект",
      few: "объекта",
      many: "объектов",
      other: "объекта",
    },
    entries: { one: "запись", few: "записи", many: "записей", other: "записи" },
    days: { one: "день", few: "дня", many: "дней", other: "дня" },
    attempts: {
      one: "попытка",
      few: "попытки",
      many: "попыток",
      other: "попытки",
    },
    measurements: {
      one: "замер",
      few: "замера",
      many: "замеров",
      other: "замера",
    },
    times: { one: "раз", few: "раза", many: "раз", other: "раза" },
    records: { one: "запись", few: "записи", many: "записей", other: "записи" },
    identifiers: {
      one: "идентификатор",
      few: "идентификатора",
      many: "идентификаторов",
      other: "идентификатора",
    },
    assertions: {
      one: "утверждение",
      few: "утверждения",
      many: "утверждений",
      other: "утверждения",
    },
    decisions: {
      one: "решение",
      few: "решения",
      many: "решений",
      other: "решения",
    },
  },
  reasons: {
    names: {
      shared_identifier: "Общий внешний идентификатор",
      exact_scientific_authorship: "То же научное название и автор",
      canonical_same_kingdom_rank: "То же научное название, царство и ранг",
      fuzzy_same_genus: "Почти то же название в том же роде",
      denomination_equal: "То же название сорта или породы",
      denomination_transliteration:
        "То же название сорта в другой транслитерации",
      co_usage: "Садоводы употребляют оба названия",
      label_scientific_name: "Название садовода — научное название",
      label_scientific_synonym: "Название садовода — синоним научного названия",
      homonym_kingdom_conflict: "То же название в другом царстве",
      search_miss: "Садоводы искали и не нашли",
      eppo_ladder: "Запись EPPO совпала с карточкой",
      eppo_facts: "Факты из EPPO",
      eppo_ambiguous: "Запись EPPO подходит нескольким карточкам",
      eppo_unmatched: "Запись EPPO не нашла карточки",
      register_species_unmatched: "Вид сорта из реестра не найден",
      col_shared_identifier:
        "Один идентификатор Catalogue of Life на двух карточках",
      col_accepted_became_synonym:
        "Catalogue of Life теперь считает название синонимом",
      col_unmatched: "Catalogue of Life не нашёл эту карточку",
      col_materialize: "Карточка из Catalogue of Life",
      col_materialize_existing: "Карточка из Catalogue of Life",
      col_refresh: "Обновление из Catalogue of Life",
      legacy_source_link: "Давняя связь с источником",
      wikidata_crosswalk: "Сопоставление с Wikidata",
      merge_from_card: "Объединение, предложенное на карточке",
    },
    sharedIdentifier: "Тот же идентификатор {scheme}",
    identifierConflict: "Идентификатор {scheme} уже у другой карточки",
    unknown: "Правило без названия",
  },
  queue: {
    metadataTitle: "Очередь решений каталога",
    title: "Очередь решений каталога",
    description:
      "Одно решение за раз, самое важное сверху. Каждое предложение показывает, что именно изменится и почему.",
    empty:
      "Нет открытых решений. Всё, что можно было решить автоматически, уже решено.",
    emptyFiltered: "Открытых решений этого типа нет.",
    summary: "Открыто {count}",
    summaryOldest: "самому старому {age}",
    shown: "Показаны первые {shown} из {total}, по влиянию.",
    filterLabel: "Тип решения",
    filterAll: "Все типы",
    itemTypes: {
      label_link: "Название садовода",
      node_merge: "Объединение карточек",
      source_link: "Связь с источником",
      split_review: "Просмотр разделения",
    },
    decisionHeading: "Текущее решение",
    listHeading: "Открытые решения",
    listCaption: "Открытые решения, самое большое влияние сверху",
    columns: {
      identity: "Что",
      reason: "Почему",
      state: "Состояние",
      impact: "Влияние",
      action: "Действие",
    },
    review: "Открыть",
    reviewLabel: "Открыть: {name}",
    reviewing: "На экране",
    states: {
      ready: "Можно решить",
      confirm: "Нужно подтверждение",
      blocked: "Принять нельзя",
    },
    blocked: {
      no_target:
        "Нет карточки, к которой это привязать, так что принимать нечего. Отклоните или пропустите.",
      target_inactive:
        "Карточку, которую оно называет, уже объединили или убрали. Принять не получится.",
      not_applied_here:
        "Разделение карточки не применяется из очереди — его смотрят на самой карточке.",
    },
    impact: "Влияние",
    confidence: "Уверенность",
    reasons: "Основания",
    subject: "Что меняется",
    target: "На что",
    label: "Название садовода",
    identifiers: "Идентификаторы",
    openCard: "Открыть карточку",
    accept: "Принять",
    reject: "Отклонить",
    skip: "Пропустить",
    previousItem: "Предыдущее",
    nextItem: "Следующее",
    position: "Решение {index} из {count}",
    keyboardHint: "С клавиатуры",
    keys: {
      accept: "Принять",
      reject: "Отклонить",
      next: "Следующее решение",
      previous: "Предыдущее решение",
      undo: "Отменить последнее автоматическое действие",
    },
    shortcutsOn: "Клавиши работают",
    shortcutsOff: "Клавиши выключены",
    shortcutsTurnOff: "Выключить клавиши",
    shortcutsTurnOn: "Включить клавиши",
    confirmMerge: "Подтвердить объединение",
    confirmMergeHint:
      "Это объединение перенесёт {objects} садоводов. Подтвердите, чтобы продолжить.",
    createdAt: "Предложено {date}",
    outcome: {
      accepted: "Принято: {name}.",
      rejected: "Отклонено: {name}.",
      skipped:
        "Пропущено: {name}. Решение не записано, и в очереди его больше нет.",
      reverted: "Автоматическое действие отменено: {name}.",
      stale: "{name} уже решено раньше — ничего не изменено.",
      failed: "Не удалось: {name}. Ничего не изменено — попробуйте ещё раз.",
      confirm:
        "С тех пор как вы открыли это решение, объектов стало больше. Проверьте количество и подтвердите ещё раз.",
      denied:
        "Решать здесь может только владелец каталога. Ничего не изменено.",
    },
  },
  automatic: {
    heading: "Применено автоматически за неделю",
    hint: "Каждое из них отменяется одним движением.",
    empty: "За неделю ничего не применено автоматически.",
    caption: "Автоматические решения за семь дней, новые сверху",
    columns: {
      what: "Что",
      rule: "Правило",
      when: "Когда",
      state: "Состояние",
      action: "Действие",
    },
    applied: "Действует",
    reverted: "Отменено",
    undo: "Отменить",
    undoLabel: "Отменить: {name}",
  },
  sources: {
    metadataTitle: "Источники каталога",
    title: "Источники каталога",
    description:
      "Откуда каталог знает то, что знает: версия, лицензия, сколько записей дошло до карточек и когда источник обновляли.",
    empty: "Ни один источник ещё не загружен.",
    heading: "Источники",
    caption: "Источники каталога по названию",
    columns: {
      source: "Источник",
      freshness: "Свежесть",
      coverage: "Покрытие",
      action: "Действие",
    },
    version: "Версия {version}",
    license: "Лицензия: {license}",
    attribution: "Указание источника",
    snapshot: "Снимок от {date}",
    verified: "проверен {date}",
    rejectedAfter:
      "Более новый снимок от {date} отклонён — показан предыдущий.",
    cadence: "Обновляют {cadence}",
    cadenceNames: {
      twice_a_year: "дважды в год",
      as_released: "когда выходит новое издание",
    },
    refreshStates: {
      none: "Отсюда ещё не обновляли.",
      pending: "Обновление в очереди с {date}.",
      processing: "Обновляется с {date}.",
      done: "Последнее обновление завершено {date}.",
      failed: "Обновление {date} не удалось — будет ещё попытка.",
      dead: "Обновление {date} не удалось.",
    },
    refresh: "Обновить",
    refreshLabel: "Обновить: {source}",
    linkedShare: "Привязано к карточкам: {linked} из {records} ({share}%)",
    coverageFailed: "Не удалось посчитать записи этого источника.",
    coverageRetry: "Повторить",
    outcome: {
      queued: "Обновление поставлено в очередь: {source}.",
      failed:
        "Не удалось поставить обновление в очередь: {source}. Попробуйте ещё раз.",
      denied:
        "Обновлять источники может только владелец каталога. Ничего не изменено.",
      unknownSource: "Такого источника нет — ничего не изменено.",
    },
  },
  health: {
    title: "Работает ли выбор",
    description:
      "Что происходит, когда садовод ищет растение: сколько раз нашёл, сколько раз написал своё название, сколько раз ушёл ни с чем.",
    empty: "Ещё ни один выбор не измерен.",
    caption: "Выбор в каталоге за неделю и за месяц",
    metric: "Показатель",
    window: { "7": "Неделя", "30": "Месяц" },
    windowRange: "{from} – {to}",
    attempts: "Попытки",
    pickSuccess: "Нашли в каталоге",
    ownLabel: "Написали своё название",
    abandoned: "Ушли ни с чем",
    share: "{part} из {whole}",
    medianTimeToPick: "Медианное время выбора",
    p95TimeToPick: "P95 времени выбора",
    measured: "{value} · {sample}",
    insufficient: "Мало замеров: {sample} из {needed}",
    notMeasured: "Не измерено",
    sampleRule:
      "Медиана показана от {median} замеров, P95 — от {p95}, доли в процентах — от {share} попыток. Меньше — это ещё не статистика.",
    misses: "Что искали и не нашли",
    missesHint:
      "Самые частые запросы без результата. Каждый можно превратить в решение.",
    missesEmpty: "Нет нерешённых запросов без результата.",
    missesCaption: "Запросы без результата, самые частые сверху",
    missesColumns: {
      query: "Запрос",
      times: "Сколько раз",
      lastSeen: "Последний раз",
      action: "Действие",
    },
    makeQueueItem: "В очередь решений",
    makeQueueItemLabel: "В очередь решений: {query}",
    missOutcome: {
      queued: "Добавлено в очередь решений: {query}.",
      failed: "Не удалось добавить в очередь решений — попробуйте ещё раз.",
      denied:
        "Добавлять решения может только владелец каталога. Ничего не изменено.",
    },
    openQueueItem: "Открыть в очереди",
    precision: "Точность автоматических решений",
    precisionHint:
      "Сколько автоматических решений за 30 дней потом отменили, по правилу. Правило, чьи решения часто отменяют, применяется слишком смело.",
    precisionEmpty: "За 30 дней автоматических решений не было.",
    precisionCaption: "Автоматические решения за 30 дней, по правилу",
    precisionColumns: {
      rule: "Правило",
      applied: "Применено",
      reverted: "Отменено",
      share: "Доля отменённых",
    },
    unplaced: "Записи источников, которым нет места в графе",
    unplacedHint:
      "Источник знает организм, для которого каталог не создаёт карточку: род, семейство или запись без царства. Это покрытие, а не решение — каталог моделирует вид и ниже.",
    unplacedEmpty: "Все записи источников размещены.",
    unplacedCaption: "Неразмещённые записи по источнику",
    unplacedColumns: {
      source: "Источник",
      records: "Записей",
      oldest: "Самой старой",
    },
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

/** "3 об'єкти", "1 обект", "5 объектов". */
export function countOperatorCatalogUnit(
  locale: InterfaceLocale,
  count: number,
  forms: CountForms,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const form =
    category === "one"
      ? forms.one
      : category === "few"
        ? (forms.few ?? forms.other)
        : category === "many"
          ? (forms.many ?? forms.other)
          : forms.other;
  return `${new Intl.NumberFormat(locale).format(count)} ${form}`;
}

/**
 * A reason code in words: the rule it names, with its scheme where it has
 * one. The code itself is returned beside the words, because it is what the
 * worker's log and the thresholds table are keyed by — the owner reads the
 * words and can still find the rule.
 */
export function describeCurationReason(
  copy: OperatorCatalogCopy,
  code: string,
  schemeName: (scheme: string) => string,
): { label: string; code: string } {
  const [base = "", detail = ""] = code.split(":", 2);
  const names = copy.reasons.names;
  if (base === "shared_identifier" && detail) {
    return {
      label: copy.reasons.sharedIdentifier.replace(
        "{scheme}",
        schemeName(detail),
      ),
      code,
    };
  }
  if (base.endsWith("_identifier_conflict")) {
    const scheme = base.slice(0, -"_identifier_conflict".length);
    return {
      label: copy.reasons.identifierConflict.replace(
        "{scheme}",
        schemeName(scheme),
      ),
      code,
    };
  }
  const named = names[base];
  if (named) return { label: named, code };
  return { label: copy.reasons.unknown, code };
}
