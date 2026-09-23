import type { InterfaceLocale } from "@/lib/interface-localization";

type WidenCopy<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: WidenCopy<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: WidenCopy<T[Key]> }
      : T;

const UK_COPY = {
  followUpSection: {
    title: "Додати датований запис",
    description: "Зберігайте всю історію цього об'єкта в одному місці.",
  },
  sections: {
    label: "Розділи об'єкта",
    history: "Історія",
    settings: "Налаштування",
    provenance: "Походження",
    backToObject: "До історії об'єкта",
  },
  settingsPage: {
    title: "Налаштування об'єкта",
    description:
      "Приватність місця, відповідність каталогу й джерело даних. Записи від цього не змінюються.",
  },
  provenancePage: {
    title: "Походження об'єкта",
  },
  composer: {
    initialMessage: "Збережіть датоване продовження для {objectName}.",
    updating: "Оновлення {objectName}. Об'єкт і простір додаються автоматично.",
    fields: {
      whatChanged: "Що змінилося?",
      bodyPlaceholder:
        "Короткого спостереження достатньо. Деталі можна додати пізніше.",
      detailsHint: "заголовок, дата, теми",
      titlePlaceholder: "Друга хвиля цвітіння",
    },
    actions: {
      saveOnline: "Зберегти продовження",
    },
  },
  privacy: {
    title: "Приватність місця",
    location: "Місце",
    hidden: "Приховано",
    region: "Регіон",
    coarseRegion: "Узагальнений регіон",
    chooseRegion: "Оберіть регіон",
    regionHelp:
      "Якщо пізніше опублікувати запис, цей регіон може з'явитися на публічній сторінці. Точне місце ніколи не показується.",
    hiddenHelp: "Поки місце приховане, публічні сторінки його не показують.",
    save: "Зберегти",
  },
  catalog: {
    title: "Зіставити цей об'єкт із каталогом",
    current: "Поточне значення: {value} · {state}",
    noName: "Назви в каталозі ще немає",
    matchLabel: "Відповідність каталогу",
    placeholder: "Вид, сорт чи порода — або своя назва",
    clearAria: "Очистити відповідність каталогу",
    noMatch: "Нічого не вибрано. Об'єкт лишається як є.",
    save: "Зберегти відповідність каталогу",
    proposed: "Після збереження: «{proposed}» замість «{current}».",
    proposedFirst: "Після збереження: «{proposed}».",
    fixedTitle: "Відповідність каталогу",
    fixed: "Об'єкт зіставлено з каталогом: «{value}».",
  },
  source: {
    summary: "Джерело: {sourceName}. Нормалізовано OverGarden.",
    euLegalCaveat:
      "EU Plant Variety Portal не має юридичної сили; юридично обов'язковим джерелом Спільного каталогу є Official Journal of the European Union.",
    open: "Відкрити джерело",
  },
  entryActions: {
    openPassport: "Відкрити публічний паспорт",
    publicationLead:
      "Опублікувати цей запис як публічну сторінку. Люди з посиланням зможуть прочитати заголовок, нотатку, дату, ідентичність об'єкта та вибраний регіон, якщо його видимість увімкнено.",
    publicationMedia:
      "Браузер готує фотографії у форматі WebP перед завантаженням. OverGarden не зберігає вибрані оригінали й не обробляє фотографії на сервері. Фото стають публічними після успішної публікації.",
    publicationPilot:
      "Опубліковані записи відкриті для всіх і можуть з’являтися в пошукових системах. Не публікуйте те, що хочете залишити приватним.",
    readDisclosure: "Прочитати пояснення",
    reviewed:
      "Перевірте текст, фотографії та адресата перед публікацією. Запис буде відкритий для всіх.",
    publishButton: "Опублікувати запис",
  },
  provenance: {
    title: "Походження",
    description:
      "Запишіть, звідки походить цей об'єкт, не розкриваючи джерело публічно.",
    sourceObject: "Об'єкт-джерело",
    recordObjectSource: "Записати об'єкт-джерело",
    noSourcePlants:
      "У вашому саду ще немає іншої рослини, від якої могла б походити ця. Щойно ви її додасте, вона з'явиться тут.",
    noSourceAnimals:
      "У вашому саду ще немає іншої тварини, від якої могла б походити ця. Щойно ви її додасте, вона з'явиться тут.",
    recordsTitle: "Записи походження",
    addTitle: "Записати джерело",
    sourceType: "Тип джерела",
    sourceTypes: {
      person: "Людина",
      seedPacket: "Пакет насіння",
      nursery: "Розсадник",
      catalogVariety: "Каталог або сорт",
      other: "Інше",
      source: "джерело",
    },
    privateSourceLabel: "Приватна назва джерела",
    privateSourcePlaceholder: "Пакет насіння з весняного обміну",
    contactFree:
      "Не додавайте до назви контактні дані: електронну адресу, телефон, URL, псевдонім, точну адресу чи координати.",
    recordPrivateSource: "Записати приватне джерело",
    invitedSourceLabel: "Назва запрошеного джерела",
    invitedSourcePlaceholder: "Насіння, збережене Марією",
    invitationHelp:
      "Створює джерело з очікуваним запрошенням. Посилання відкриває деталі лише після входу; не додавайте контактні дані, URL, псевдоніми, адреси чи координати.",
    createInvite: "Створити запрошення джерела",
    chooseSource: "Оберіть об'єкт-джерело",
    sameKindPlants:
      "Лише рослини з вашого саду: рослина не походить від тварини.",
    sameKindAnimals:
      "Лише тварини з вашого саду: тварина не походить від рослини.",
    confirmObjectSource: "Записати: «{subject}» походить від «{source}»",
    crossKind:
      "Не записано: рослина не може походити від тварини, а тварина — від рослини. Оберіть об'єкт того самого виду.",
    recorded: "Походження записано.",
    kinds: { plant: "Рослина", animal: "Тварина" },
    empty: "Походження цього об'єкта ще не записано.",
    edge: {
      fromObject: "Походить від {source}",
      invitationPending: "Запрошення очікує для {source}",
      fromReference: "Походить від {source} · {kind}",
      privateSource: "приватне джерело",
      unknownIdentity: "Невідомо",
    },
    consent: {
      pendingInvited: "Запрошене джерело очікує",
      confirmed: "Походження підтверджено",
      declined: "Походження відхилено",
      anonymized: "Походження анонімізовано",
      proposed: "Походження запропоновано",
    },
    visibility: {
      pendingInvited: "Не додається публічно до прийняття запрошення",
      confirmed: "Може з'явитися в огляді походження",
      declined: "Не публікується й не враховується",
      anonymized: "Структурний запис без ідентичності",
      proposed: "Лише для власника до підтвердження",
    },
    inviteState: "Стан запрошення: {state}",
    inviteStates: {
      claimed: "прийнято",
      declined: "відхилено",
      anonymized: "анонімізовано",
      pending: "очікує",
    },
    openPrivateInvite: "Відкрити приватне запрошення",
    inviteLinkExpired:
      "Посилання вже не діє: минуло 30 днів від створення. Створіть нове запрошення нижче.",
    readbackAvailable:
      "Для безпечних публічних посилань доступний огляд підтвердженого походження.",
    openReadback: "Відкрити огляд походження",
  },
  progress: {
    title: "Прогрес живого об'єкта",
    span: "Від {start} до {end}",
    privateReadback: "Приватний огляд для {objectName} — його бачите лише ви.",
    privateReadbackWithSpan:
      "{span} — приватний огляд для {objectName}, який бачите лише ви.",
    earlierPhoto: "Раніше",
    latestPhoto: "Останнє фото",
    photoAlt: "Фото до запису «{title}»",
  },
  valuePulse: {
    title: "Коротка приватна перевірка",
    description:
      "Після цього продовження чи здається вам, що історію живого об'єкта варто зберігати? Відповідь залишається приватною й допомагає поліпшити OverGarden.",
    usefulness: {
      useful: "Так, варто зберігати",
      notSure: "Ще не впевнений(-а)",
      notUseful: "Не дуже",
    },
    optionalPrompt: "Необов'язково: що було найважливішим?",
    reasonLabel: "Причина (необов'язково)",
    skipReason: "Пропустити причину",
    reasons: {
      historyWorthKeeping: "Накопичену історію варто зберігати",
      easyToAdd: "Це оновлення було легко додати",
      priorEntriesHelped: "Попередні записи допомогли під час написання",
      feltRedundant: "Це здалося зайвим або непотрібним",
      hardToFind: "Було важко знайти потрібне в попередніх записах",
      notSureWhy: "Не впевнений(-а), чому",
    },
    send: "Надіслати відповідь",
    back: "Назад",
    skip: "Пропустити зараз",
    error: "Не вдалося зберегти відповідь. Спробуйте ще раз.",
  },
} as const;

export type OwnerObjectCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY = {
  followUpSection: {
    title: "Добавяне на запис с дата",
    description: "Пазете цялата история на този обект на едно място.",
  },
  sections: {
    label: "Раздели на обекта",
    history: "История",
    settings: "Настройки",
    provenance: "Произход",
    backToObject: "Към историята на обекта",
  },
  settingsPage: {
    title: "Настройки на обекта",
    description:
      "Поверителност на мястото, съответствие с каталога и източник на данни. Записите не се променят.",
  },
  provenancePage: {
    title: "Произход на обекта",
  },
  composer: {
    initialMessage: "Запазете датирано продължение за {objectName}.",
    updating:
      "Обновявате {objectName}. Обектът и пространството се свързват автоматично.",
    fields: {
      whatChanged: "Какво се промени?",
      bodyPlaceholder:
        "Кратко наблюдение е достатъчно. Можете да добавите подробности по-късно.",
      detailsHint: "заглавие, дата, теми",
      titlePlaceholder: "Втора вълна на цъфтеж",
    },
    actions: {
      saveOnline: "Запазване на продължението",
    },
  },
  privacy: {
    title: "Поверителност на местоположението",
    location: "Местоположение",
    hidden: "Скрито",
    region: "Регион",
    coarseRegion: "Обобщен регион",
    chooseRegion: "Изберете регион",
    regionHelp:
      "Ако по-късно публикувате запис, този регион може да се появи на публичната страница. Точното местоположение никога не се показва.",
    hiddenHelp:
      "Докато местоположението е скрито, публичните страници не го показват.",
    save: "Запазване",
  },
  catalog: {
    title: "Съпоставяне на обекта с каталога",
    current: "Текущо: {value} · {state}",
    noName: "Все още няма име от каталога",
    matchLabel: "Съвпадение в каталога",
    placeholder: "Вид, сорт или порода — или собствено име",
    clearAria: "Изчистване на съвпадението в каталога",
    noMatch: "Нищо не е избрано. Обектът остава както е.",
    save: "Запазване на съвпадението в каталога",
    proposed: "След запазване: „{proposed}“ вместо „{current}“.",
    proposedFirst: "След запазване: „{proposed}“.",
    fixedTitle: "Съвпадение в каталога",
    fixed: "Обектът е свързан с каталога: „{value}“.",
  },
  source: {
    summary: "Източник: {sourceName}. Нормализирано от OverGarden.",
    euLegalCaveat:
      "EU Plant Variety Portal няма правна стойност; правно обвързващият източник на Общия каталог е Official Journal of the European Union.",
    open: "Отваряне на източника",
  },
  entryActions: {
    openPassport: "Отваряне на публичния паспорт",
    publicationLead:
      "Публикувайте този запис като публична страница. Всеки с връзката може да прочете заглавието, бележката, датата, самоличността на обекта и избрания регион, ако е видим.",
    publicationMedia:
      "Браузърът подготвя снимките във формат WebP преди качването. OverGarden не съхранява избраните оригинали и не обработва снимките на сървъра. Снимките стават публични след успешно публикуване.",
    publicationPilot:
      "Публикуваните записи са достъпни за всички и могат да се появяват в търсачки. Не публикувайте неща, които искате да останат лични.",
    readDisclosure: "Прочетете пояснението",
    reviewed:
      "Проверете текста, снимките и получателя преди публикуване. Записът ще е достъпен за всички.",
    publishButton: "Публикуване на записа",
  },
  provenance: {
    title: "Произход",
    description:
      "Запишете откъде идва този обект, без да правите източника публичен.",
    sourceObject: "Обект източник",
    recordObjectSource: "Записване на обект източник",
    noSourcePlants:
      "В градината ви още няма друго растение, от което да произхожда това. Щом го добавите, ще се появи тук.",
    noSourceAnimals:
      "В градината ви още няма друго животно, от което да произхожда това. Щом го добавите, ще се появи тук.",
    recordsTitle: "Записи за произход",
    addTitle: "Записване на източник",
    sourceType: "Тип на източника",
    sourceTypes: {
      person: "Човек",
      seedPacket: "Пакет семена",
      nursery: "Разсадник",
      catalogVariety: "Каталог или сорт",
      other: "Друго",
      source: "източник",
    },
    privateSourceLabel: "Частно име на източника",
    privateSourcePlaceholder: "Пакет семена от пролетна размяна",
    contactFree:
      "Не добавяйте данни за контакт: имейл, телефон, URL, потребителско име, точен адрес или координати.",
    recordPrivateSource: "Записване на частен източник",
    invitedSourceLabel: "Име на поканения източник",
    invitedSourcePlaceholder: "Семена, запазени от Мария",
    invitationHelp:
      "Създава източник с чакаща покана. Връзката разкрива подробности само след вход; не добавяйте контакти, URL адреси, потребителски имена, адреси или координати.",
    createInvite: "Създаване на покана за източника",
    chooseSource: "Изберете обект-източник",
    sameKindPlants:
      "Само растения от градината ви: растение не произлиза от животно.",
    sameKindAnimals:
      "Само животни от градината ви: животно не произлиза от растение.",
    confirmObjectSource: "Запиши: „{subject}“ произлиза от „{source}“",
    crossKind:
      "Не е записано: растение не може да произлиза от животно, нито животно от растение. Изберете обект от същия вид.",
    recorded: "Произходът е записан.",
    kinds: { plant: "Растение", animal: "Животно" },
    empty: "Все още няма записан произход за този обект.",
    edge: {
      fromObject: "Произхожда от {source}",
      invitationPending: "Поканата за {source} изчаква",
      fromReference: "Произхожда от {source} · {kind}",
      privateSource: "частен източник",
      unknownIdentity: "Неизвестно",
    },
    consent: {
      pendingInvited: "Поканеният източник изчаква",
      confirmed: "Произходът е потвърден",
      declined: "Произходът е отхвърлен",
      anonymized: "Произходът е анонимизиран",
      proposed: "Произходът е предложен",
    },
    visibility: {
      pendingInvited: "Няма публичен принос преди приемане на поканата",
      confirmed: "Може да се покаже в прегледа на произхода",
      declined: "Не е публично и не допринася",
      anonymized: "Структурен запис без самоличност",
      proposed: "Само за собственика до потвърждение",
    },
    inviteState: "Състояние на поканата: {state}",
    inviteStates: {
      claimed: "приета",
      declined: "отхвърлена",
      anonymized: "анонимизирана",
      pending: "изчаква",
    },
    openPrivateInvite: "Отваряне на частната покана",
    inviteLinkExpired:
      "Връзката вече не важи: минаха 30 дни от създаването ѝ. Създайте нова покана по-долу.",
    readbackAvailable:
      "За безопасни публични връзки е достъпен преглед на потвърдения произход.",
    openReadback: "Отваряне на прегледа на произхода",
  },
  progress: {
    title: "Напредък на живия обект",
    span: "От {start} до {end}",
    privateReadback: "Частен преглед за {objectName} — виждате го само вие.",
    privateReadbackWithSpan:
      "{span} — частен преглед за {objectName}, който виждате само вие.",
    earlierPhoto: "По-ранна снимка",
    latestPhoto: "Последна снимка",
    photoAlt: "Снимка към записа „{title}“",
  },
  valuePulse: {
    title: "Кратка частна проверка",
    description:
      "След това продължение струва ли си да пазите историята на живия обект? Отговорът остава частен и ни помага да подобрим OverGarden.",
    usefulness: {
      useful: "Да, струва си да се пази",
      notSure: "Още не съм сигурен/сигурна",
      notUseful: "Не особено",
    },
    optionalPrompt: "По желание: какво беше най-важно?",
    reasonLabel: "Причина (по желание)",
    skipReason: "Пропускане на причината",
    reasons: {
      historyWorthKeeping: "Натрупаната история си струва да се пази",
      easyToAdd: "Беше лесно да добавя това обновяване",
      priorEntriesHelped: "По-ранните записи помогнаха при писането",
      feltRedundant: "Изглеждаше излишно или ненужно",
      hardToFind: "Беше трудно да намеря нужното в по-ранните записи",
      notSureWhy: "Не съм сигурен/сигурна защо",
    },
    send: "Изпращане на отговора",
    back: "Назад",
    skip: "Пропускане засега",
    error: "Отговорът не можа да бъде запазен. Опитайте отново.",
  },
} as const satisfies OwnerObjectCopy;

const RU_COPY = {
  followUpSection: {
    title: "Добавить запись с датой",
    description: "Храните всю историю этого объекта в одном месте.",
  },
  sections: {
    label: "Разделы объекта",
    history: "История",
    settings: "Настройки",
    provenance: "Происхождение",
    backToObject: "К истории объекта",
  },
  settingsPage: {
    title: "Настройки объекта",
    description:
      "Приватность места, соответствие каталогу и источник данных. Записи от этого не меняются.",
  },
  provenancePage: {
    title: "Происхождение объекта",
  },
  composer: {
    initialMessage: "Сохраните датированное продолжение для {objectName}.",
    updating:
      "Обновление {objectName}. Объект и пространство связываются автоматически.",
    fields: {
      whatChanged: "Что изменилось?",
      bodyPlaceholder:
        "Короткого наблюдения достаточно. Подробности можно добавить позже.",
      detailsHint: "заголовок, дата, темы",
      titlePlaceholder: "Вторая волна цветения",
    },
    actions: {
      saveOnline: "Сохранить продолжение",
    },
  },
  privacy: {
    title: "Конфиденциальность местоположения",
    location: "Местоположение",
    hidden: "Скрыто",
    region: "Регион",
    coarseRegion: "Обобщённый регион",
    chooseRegion: "Выберите регион",
    regionHelp:
      "Если позже опубликовать запись, этот регион может появиться на публичной странице. Точное местоположение никогда не показывается.",
    hiddenHelp:
      "Пока местоположение скрыто, публичные страницы его не показывают.",
    save: "Сохранить",
  },
  catalog: {
    title: "Сопоставить объект с каталогом",
    current: "Текущее значение: {value} · {state}",
    noName: "Названия из каталога пока нет",
    matchLabel: "Соответствие каталогу",
    placeholder: "Вид, сорт или порода — или своё название",
    clearAria: "Очистить соответствие каталогу",
    noMatch: "Ничего не выбрано. Объект остаётся как есть.",
    save: "Сохранить соответствие каталогу",
    proposed: "После сохранения: «{proposed}» вместо «{current}».",
    proposedFirst: "После сохранения: «{proposed}».",
    fixedTitle: "Соответствие каталогу",
    fixed: "Объект сопоставлен с каталогом: «{value}».",
  },
  source: {
    summary: "Источник: {sourceName}. Нормализовано OverGarden.",
    euLegalCaveat:
      "EU Plant Variety Portal не имеет юридической силы; юридически обязательным источником Общего каталога является Official Journal of the European Union.",
    open: "Открыть источник",
  },
  entryActions: {
    openPassport: "Открыть публичный паспорт",
    publicationLead:
      "Опубликуйте эту запись как публичную страницу. Люди со ссылкой смогут прочитать заголовок, заметку, дату, идентичность объекта и выбранный регион, если он видим.",
    publicationMedia:
      "Браузер подготавливает фотографии в формате WebP перед загрузкой. OverGarden не хранит выбранные оригиналы и не обрабатывает фотографии на сервере. Фото становятся публичными после успешной публикации.",
    publicationPilot:
      "Опубликованные записи доступны всем и могут появляться в поисковых системах. Не публикуйте то, что хотите оставить личным.",
    readDisclosure: "Прочитать пояснение",
    reviewed:
      "Проверьте текст, фотографии и адресата перед публикацией. Запись будет доступна всем.",
    publishButton: "Опубликовать запись",
  },
  provenance: {
    title: "Происхождение",
    description:
      "Запишите, откуда появился этот объект, не раскрывая источник публично.",
    sourceObject: "Объект-источник",
    recordObjectSource: "Записать объект-источник",
    noSourcePlants:
      "В вашем саду ещё нет другого растения, от которого могло бы происходить это. Как только вы его добавите, оно появится здесь.",
    noSourceAnimals:
      "В вашем саду ещё нет другого животного, от которого могло бы происходить это. Как только вы его добавите, оно появится здесь.",
    recordsTitle: "Записи происхождения",
    addTitle: "Записать источник",
    sourceType: "Тип источника",
    sourceTypes: {
      person: "Человек",
      seedPacket: "Пакет семян",
      nursery: "Питомник",
      catalogVariety: "Каталог или сорт",
      other: "Другое",
      source: "источник",
    },
    privateSourceLabel: "Приватное название источника",
    privateSourcePlaceholder: "Пакет семян с весеннего обмена",
    contactFree:
      "Не добавляйте контактные данные: электронную почту, телефон, URL, псевдоним, точный адрес или координаты.",
    recordPrivateSource: "Записать приватный источник",
    invitedSourceLabel: "Название приглашённого источника",
    invitedSourcePlaceholder: "Семена, сохранённые Марией",
    invitationHelp:
      "Создаёт источник с ожидающим приглашением. Ссылка раскрывает подробности только после входа; не добавляйте контакты, URL, псевдонимы, адреса или координаты.",
    createInvite: "Создать приглашение источника",
    chooseSource: "Выберите объект-источник",
    sameKindPlants:
      "Только растения из вашего сада: растение не происходит от животного.",
    sameKindAnimals:
      "Только животные из вашего сада: животное не происходит от растения.",
    confirmObjectSource: "Записать: «{subject}» происходит от «{source}»",
    crossKind:
      "Не записано: растение не может происходить от животного, а животное — от растения. Выберите объект того же вида.",
    recorded: "Происхождение записано.",
    kinds: { plant: "Растение", animal: "Животное" },
    empty: "Происхождение этого объекта ещё не записано.",
    edge: {
      fromObject: "Происходит от {source}",
      invitationPending: "Приглашение для {source} ожидает",
      fromReference: "Происходит от {source} · {kind}",
      privateSource: "приватный источник",
      unknownIdentity: "Неизвестно",
    },
    consent: {
      pendingInvited: "Приглашённый источник ожидает",
      confirmed: "Происхождение подтверждено",
      declined: "Происхождение отклонено",
      anonymized: "Происхождение анонимизировано",
      proposed: "Происхождение предложено",
    },
    visibility: {
      pendingInvited: "Не добавляется публично до принятия приглашения",
      confirmed: "Может появиться в обзоре происхождения",
      declined: "Не публикуется и не учитывается",
      anonymized: "Структурная запись без идентичности",
      proposed: "Только для владельца до подтверждения",
    },
    inviteState: "Состояние приглашения: {state}",
    inviteStates: {
      claimed: "принято",
      declined: "отклонено",
      anonymized: "анонимизировано",
      pending: "ожидает",
    },
    openPrivateInvite: "Открыть приватное приглашение",
    inviteLinkExpired:
      "Ссылка больше не действует: прошло 30 дней с её создания. Создайте новое приглашение ниже.",
    readbackAvailable:
      "Для безопасных публичных ссылок доступен обзор подтверждённого происхождения.",
    openReadback: "Открыть обзор происхождения",
  },
  progress: {
    title: "Прогресс живого объекта",
    span: "С {start} по {end}",
    privateReadback: "Приватный обзор для {objectName} — его видите только вы.",
    privateReadbackWithSpan:
      "{span} — приватный обзор для {objectName}, который видите только вы.",
    earlierPhoto: "Ранее",
    latestPhoto: "Последнее фото",
    photoAlt: "Фото к записи «{title}»",
  },
  valuePulse: {
    title: "Короткая приватная проверка",
    description:
      "После этого продолжения кажется ли вам, что историю живого объекта стоит сохранять? Ответ остаётся приватным и помогает улучшить OverGarden.",
    usefulness: {
      useful: "Да, стоит сохранять",
      notSure: "Пока не уверен(-а)",
      notUseful: "Не особо",
    },
    optionalPrompt: "Необязательно: что было важнее всего?",
    reasonLabel: "Причина (необязательно)",
    skipReason: "Пропустить причину",
    reasons: {
      historyWorthKeeping: "Накопленную историю стоит сохранять",
      easyToAdd: "Это обновление было легко добавить",
      priorEntriesHelped: "Предыдущие записи помогли при написании",
      feltRedundant: "Это показалось лишним или ненужным",
      hardToFind: "Было сложно найти нужное в предыдущих записях",
      notSureWhy: "Не уверен(-а), почему",
    },
    send: "Отправить ответ",
    back: "Назад",
    skip: "Пропустить сейчас",
    error: "Не удалось сохранить ответ. Попробуйте ещё раз.",
  },
} as const satisfies OwnerObjectCopy;

const COPY_BY_LOCALE: Record<InterfaceLocale, OwnerObjectCopy> = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
};

export function getOwnerObjectCopy(locale: InterfaceLocale): OwnerObjectCopy {
  return COPY_BY_LOCALE[locale];
}

export function formatOwnerObjectTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{([^{}]+)\}/gu, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}
