import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WidenCopy } from "@/lib/operator-copy";

/**
 * The words of the owner's moderation (`OVE-500`): the communities a moderator
 * can open, one community's reports and settings, and the comment reports.
 *
 * It replaces the operator copy's `community` and `moderation` groups, which
 * spoke the team's vocabulary to the person deciding: a "fail-closed panel", a
 * "participation gate", a "canonical journal", and reasons printed as enum
 * values (`off_topic`). A moderator reads what was reported, by whom it was
 * written, what it is about and where it stands — and each button says what
 * it changes, in the reader's words.
 */
const UK_COPY = {
  sections: {
    label: "Модерація",
    communities: "Спільноти",
    comments: "Коментарі",
  },
  backToGarden: "Назад до саду",
  views: {
    label: "Які скарги показати",
    open: "Відкриті",
    resolved: "Розглянуті",
  },
  reasons: {
    spam: "Спам",
    harassment: "Переслідування",
    privacy: "Приватні дані",
    misinformation: "Небезпечна або хибна порада",
    off_topic: "Не за темою",
    other: "Інше",
  },
  reportStates: {
    submitted: "Нова",
    reviewed: "У роботі",
    dismissed: "Відхилена",
    actioned: "Вжито заходів",
  },
  reportedOn: "Скаргу подано",
  resolvedOn: "Розглянуто",
  noPublicAuthor: "автор без публічного профілю",
  accessDenied:
    "Модерувати можуть власник і призначені модератори. Цей акаунт до них не належить.",
  unavailable: "Не вдалося прочитати чергу. Спробуйте ще раз.",
  pending: "Зберігаємо…",
  cancel: "Скасувати",
  outcome: {
    savedTitle: "Збережено",
    staleTitle: "Нічого не змінено",
    staleBody:
      "Цю скаргу вже розглянули, тож дію не виконано. Нижче — як усе є зараз.",
    failedTitle: "Не вдалося зберегти",
    failedBody: "Нічого не змінилося. Спробуйте ще раз — повтор безпечний.",
    deniedTitle: "Немає доступу",
    deniedBody:
      "Цю дію може виконати лише модератор цієї спільноти або власник.",
    now: "Зараз",
  },
  communities: {
    metadataTitle: "Модерація спільнот | OverGarden",
    title: "Модерація спільнот",
    description:
      "Скарги учасників на записи в спільнотах і прийом нових записів. Тут лише спільноти, які ви можете модерувати.",
    empty: "Спільнот ще немає.",
    openReports: "Відкритих скарг: {count}",
    noOpenReports: "Відкритих скарг немає",
    states: {
      open: "Приймає нові записи",
      closed: "Нові записи не приймаються",
      archived: "Архів, лише для читання",
    },
    publicPage: "Сторінка спільноти",
  },
  community: {
    eyebrow: "Модерація спільноти",
    description:
      "Скарги учасників на записи цієї спільноти, рішення за ними та прийом нових записів.",
    tabs: {
      label: "Розділи модерації спільноти",
      reports: "Скарги",
      settings: "Прийом записів",
    },
    back: "Усі спільноти",
    publicPage: "Відкрити сторінку спільноти",
    emptyOpen: "Відкритих скарг немає. Нові з’являться тут.",
    emptyResolved: "Розглянутих скарг ще немає.",
    entryUnavailable:
      "Запис більше не публічний, тому його текст тут не показуємо.",
    kinds: {
      plant: "рослина",
      animal: "тварина",
    },
    stateTitle: "Як є зараз",
    contributionStates: {
      active: "запис показується в спільноті",
      removed: "запис прибрано зі спільноти",
    },
    discussionStates: {
      open: "обговорення відкрите",
      closed: "обговорення закрите",
    },
    memberStates: {
      active: "автор бере участь",
      left: "автор вийшов зі спільноти",
      banned: "авторові заборонено участь",
    },
    decideTitle: "Рішення",
    reportNow: "скарга: {state}",
    actions: {
      removeContribution: "Прибрати запис зі спільноти",
      restoreContribution: "Повернути запис у спільноту",
      closeDiscussion: "Закрити обговорення",
      openDiscussion: "Відкрити обговорення",
      banMember: "Заборонити авторові участь",
      restoreMember: "Повернути авторові участь",
      resolveActioned: "Закрити скаргу: вжито заходів",
      dismissReport: "Відхилити скаргу",
    },
    confirmRemoveTitle: "Прибрати «{title}» зі спільноти?",
    confirmRemoveBody:
      "Запис зникне зі списку спільноти разом з обговоренням. У журналі автора він лишиться, і його можна буде повернути.",
    confirmRemove: "Прибрати",
    confirmBanTitle: "Заборонити {author} участь у спільноті?",
    confirmBanBody:
      "Автор не зможе додавати записи й приєднатися знову, доки ви не повернете участь. Його вже додані записи лишаються, доки ви їх не приберете.",
    confirmBan: "Заборонити",
  },
  settings: {
    title: "Прийом нових записів",
    open: "Зараз спільнота приймає нових учасників і записи.",
    closed:
      "Зараз нові учасники й записи не приймаються. Уже додане лишається, обговорення тривають.",
    close: "Закрити прийом",
    reopen: "Відкрити прийом",
    confirmCloseTitle: "Закрити прийом нових записів?",
    confirmCloseBody:
      "Ніхто не зможе приєднатися чи додати запис, доки ви не відкриєте прийом знову. Уже додані записи й обговорення лишаються.",
    archived:
      "Спільнота в архіві: вона лише для читання, і прийом тут не змінюється.",
    nowOpen: "спільнота приймає нових учасників і записи",
    nowClosed: "нові учасники й записи не приймаються",
  },
  comments: {
    metadataTitle: "Модерація коментарів | OverGarden",
    title: "Модерація коментарів",
    description:
      "Скарги на коментарі до публічних записів, живих об’єктів і обговорень у спільнотах. Хто поскаржився, тут не показуємо.",
    emptyOpen: "Відкритих скарг на коментарі немає.",
    emptyResolved: "Розглянутих скарг на коментарі ще немає.",
    removedText: "Коментар прибрано з публічної сторінки.",
    placeUnavailable: "Сторінка з цим коментарем уже не публічна.",
    targets: {
      journal_entry: "Коментар до запису",
      lineage_object: "Коментар до живого об’єкта",
      variety: "Коментар до сорту",
      topic: "Коментар до теми",
      community_contribution: "Коментар в обговоренні спільноти",
    },
    actions: {
      review: "Взяти в роботу",
      dismiss: "Відхилити скаргу",
      remove: "Прибрати коментар",
    },
    removeTitle: "Прибрати цей коментар?",
    removeBody:
      "Коментар зникне з публічної сторінки, а всі скарги на нього буде закрито. Скасувати це не можна.",
    removeConfirm: "Прибрати",
    nowShown: "коментар показується",
    nowRemoved: "коментар прибрано з публічної сторінки",
    accessDenied:
      "Модерувати коментарі може лише власник. Цей акаунт ним не є.",
    deniedBody: "Цю дію може виконати лише власник.",
  },
} as const;

export type ModerationCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY: ModerationCopy = {
  sections: {
    label: "Модериране",
    communities: "Общности",
    comments: "Коментари",
  },
  backToGarden: "Назад към градината",
  views: {
    label: "Кои сигнали да се покажат",
    open: "Отворени",
    resolved: "Разгледани",
  },
  reasons: {
    spam: "Спам",
    harassment: "Тормоз",
    privacy: "Лични данни",
    misinformation: "Опасен или неверен съвет",
    off_topic: "Извън темата",
    other: "Друго",
  },
  reportStates: {
    submitted: "Нов",
    reviewed: "В работа",
    dismissed: "Отхвърлен",
    actioned: "Взети са мерки",
  },
  reportedOn: "Сигналът е подаден",
  resolvedOn: "Разгледан",
  noPublicAuthor: "автор без публичен профил",
  accessDenied:
    "Модерират собственикът и назначените модератори. Този акаунт не е сред тях.",
  unavailable: "Опашката не можа да бъде прочетена. Опитайте отново.",
  pending: "Запазваме…",
  cancel: "Отказ",
  outcome: {
    savedTitle: "Запазено",
    staleTitle: "Нищо не е променено",
    staleBody:
      "Този сигнал вече е разгледан, затова действието не е изпълнено. По-долу е как стоят нещата сега.",
    failedTitle: "Не можа да се запази",
    failedBody:
      "Нищо не се промени. Опитайте отново — повторението е безопасно.",
    deniedTitle: "Няма достъп",
    deniedBody:
      "Това действие може да извърши само модератор на тази общност или собственикът.",
    now: "Сега",
  },
  communities: {
    metadataTitle: "Модериране на общности | OverGarden",
    title: "Модериране на общности",
    description:
      "Сигнали на членове за записи в общностите и приемането на нови записи. Тук са само общностите, които можете да модерирате.",
    empty: "Все още няма общности.",
    openReports: "Отворени сигнали: {count}",
    noOpenReports: "Няма отворени сигнали",
    states: {
      open: "Приема нови записи",
      closed: "Не приема нови записи",
      archived: "Архив, само за четене",
    },
    publicPage: "Страница на общността",
  },
  community: {
    eyebrow: "Модериране на общността",
    description:
      "Сигнали на членове за записи в тази общност, решенията по тях и приемането на нови записи.",
    tabs: {
      label: "Раздели за модериране на общността",
      reports: "Сигнали",
      settings: "Приемане на записи",
    },
    back: "Всички общности",
    publicPage: "Отваряне на страницата на общността",
    emptyOpen: "Няма отворени сигнали. Новите ще се появят тук.",
    emptyResolved: "Все още няма разгледани сигнали.",
    entryUnavailable:
      "Записът вече не е публичен, затова текстът му не се показва тук.",
    kinds: {
      plant: "растение",
      animal: "животно",
    },
    stateTitle: "Как е сега",
    contributionStates: {
      active: "записът се показва в общността",
      removed: "записът е премахнат от общността",
    },
    discussionStates: {
      open: "обсъждането е отворено",
      closed: "обсъждането е затворено",
    },
    memberStates: {
      active: "авторът участва",
      left: "авторът е напуснал общността",
      banned: "на автора е забранено участие",
    },
    decideTitle: "Решение",
    reportNow: "сигнал: {state}",
    actions: {
      removeContribution: "Премахване на записа от общността",
      restoreContribution: "Връщане на записа в общността",
      closeDiscussion: "Затваряне на обсъждането",
      openDiscussion: "Отваряне на обсъждането",
      banMember: "Забрана за участие на автора",
      restoreMember: "Връщане на участието на автора",
      resolveActioned: "Затваряне на сигнала: взети са мерки",
      dismissReport: "Отхвърляне на сигнала",
    },
    confirmRemoveTitle: "Да се премахне ли „{title}“ от общността?",
    confirmRemoveBody:
      "Записът ще изчезне от списъка на общността заедно с обсъждането. В дневника на автора остава и може да бъде върнат.",
    confirmRemove: "Премахване",
    confirmBanTitle: "Да се забрани ли на {author} участието в общността?",
    confirmBanBody:
      "Авторът няма да може да добавя записи и да се присъедини отново, докато не върнете участието му. Вече добавените му записи остават, докато не ги премахнете.",
    confirmBan: "Забрана",
  },
  settings: {
    title: "Приемане на нови записи",
    open: "В момента общността приема нови членове и записи.",
    closed:
      "В момента не се приемат нови членове и записи. Вече добавеното остава, обсъжданията продължават.",
    close: "Спиране на приемането",
    reopen: "Възобновяване на приемането",
    confirmCloseTitle: "Да се спре ли приемането на нови записи?",
    confirmCloseBody:
      "Никой няма да може да се присъедини или да добави запис, докато не възобновите приемането. Вече добавените записи и обсъжданията остават.",
    archived:
      "Общността е в архив: само за четене е и приемането тук не се променя.",
    nowOpen: "общността приема нови членове и записи",
    nowClosed: "не се приемат нови членове и записи",
  },
  comments: {
    metadataTitle: "Модериране на коментари | OverGarden",
    title: "Модериране на коментари",
    description:
      "Сигнали за коментари към публични записи, живи обекти и обсъждания в общностите. Кой е подал сигнала, не се показва тук.",
    emptyOpen: "Няма отворени сигнали за коментари.",
    emptyResolved: "Все още няма разгледани сигнали за коментари.",
    removedText: "Коментарът е премахнат от публичната страница.",
    placeUnavailable: "Страницата с този коментар вече не е публична.",
    targets: {
      journal_entry: "Коментар към запис",
      lineage_object: "Коментар към жив обект",
      variety: "Коментар към сорт",
      topic: "Коментар към тема",
      community_contribution: "Коментар в обсъждане на общност",
    },
    actions: {
      review: "Поемане за преглед",
      dismiss: "Отхвърляне на сигнала",
      remove: "Премахване на коментара",
    },
    removeTitle: "Да се премахне ли този коментар?",
    removeBody:
      "Коментарът ще изчезне от публичната страница и всички сигнали за него ще бъдат затворени. Това не може да се отмени.",
    removeConfirm: "Премахване",
    nowShown: "коментарът се показва",
    nowRemoved: "коментарът е премахнат от публичната страница",
    accessDenied:
      "Коментарите може да модерира само собственикът. Този акаунт не е на собственика.",
    deniedBody: "Това действие може да извърши само собственикът.",
  },
};

const RU_COPY: ModerationCopy = {
  sections: {
    label: "Модерация",
    communities: "Сообщества",
    comments: "Комментарии",
  },
  backToGarden: "Назад в сад",
  views: {
    label: "Какие жалобы показать",
    open: "Открытые",
    resolved: "Рассмотренные",
  },
  reasons: {
    spam: "Спам",
    harassment: "Преследование",
    privacy: "Личные данные",
    misinformation: "Опасный или неверный совет",
    off_topic: "Не по теме",
    other: "Другое",
  },
  reportStates: {
    submitted: "Новая",
    reviewed: "В работе",
    dismissed: "Отклонена",
    actioned: "Приняты меры",
  },
  reportedOn: "Жалоба подана",
  resolvedOn: "Рассмотрена",
  noPublicAuthor: "автор без публичного профиля",
  accessDenied:
    "Модерировать могут владелец и назначенные модераторы. Этот аккаунт к ним не относится.",
  unavailable: "Не удалось прочитать очередь. Попробуйте ещё раз.",
  pending: "Сохраняем…",
  cancel: "Отмена",
  outcome: {
    savedTitle: "Сохранено",
    staleTitle: "Ничего не изменено",
    staleBody:
      "Эту жалобу уже рассмотрели, поэтому действие не выполнено. Ниже — как всё обстоит сейчас.",
    failedTitle: "Не удалось сохранить",
    failedBody: "Ничего не изменилось. Попробуйте ещё раз — повтор безопасен.",
    deniedTitle: "Нет доступа",
    deniedBody:
      "Это действие может выполнить только модератор этого сообщества или владелец.",
    now: "Сейчас",
  },
  communities: {
    metadataTitle: "Модерация сообществ | OverGarden",
    title: "Модерация сообществ",
    description:
      "Жалобы участников на записи в сообществах и приём новых записей. Здесь только сообщества, которые вы можете модерировать.",
    empty: "Сообществ пока нет.",
    openReports: "Открытых жалоб: {count}",
    noOpenReports: "Открытых жалоб нет",
    states: {
      open: "Принимает новые записи",
      closed: "Новые записи не принимаются",
      archived: "Архив, только для чтения",
    },
    publicPage: "Страница сообщества",
  },
  community: {
    eyebrow: "Модерация сообщества",
    description:
      "Жалобы участников на записи этого сообщества, решения по ним и приём новых записей.",
    tabs: {
      label: "Разделы модерации сообщества",
      reports: "Жалобы",
      settings: "Приём записей",
    },
    back: "Все сообщества",
    publicPage: "Открыть страницу сообщества",
    emptyOpen: "Открытых жалоб нет. Новые появятся здесь.",
    emptyResolved: "Рассмотренных жалоб пока нет.",
    entryUnavailable:
      "Запись больше не публичная, поэтому её текст здесь не показываем.",
    kinds: {
      plant: "растение",
      animal: "животное",
    },
    stateTitle: "Как сейчас",
    contributionStates: {
      active: "запись показывается в сообществе",
      removed: "запись убрана из сообщества",
    },
    discussionStates: {
      open: "обсуждение открыто",
      closed: "обсуждение закрыто",
    },
    memberStates: {
      active: "автор участвует",
      left: "автор вышел из сообщества",
      banned: "автору запрещено участие",
    },
    decideTitle: "Решение",
    reportNow: "жалоба: {state}",
    actions: {
      removeContribution: "Убрать запись из сообщества",
      restoreContribution: "Вернуть запись в сообщество",
      closeDiscussion: "Закрыть обсуждение",
      openDiscussion: "Открыть обсуждение",
      banMember: "Запретить автору участие",
      restoreMember: "Вернуть автору участие",
      resolveActioned: "Закрыть жалобу: приняты меры",
      dismissReport: "Отклонить жалобу",
    },
    confirmRemoveTitle: "Убрать «{title}» из сообщества?",
    confirmRemoveBody:
      "Запись исчезнет из списка сообщества вместе с обсуждением. В журнале автора она останется, и её можно будет вернуть.",
    confirmRemove: "Убрать",
    confirmBanTitle: "Запретить {author} участие в сообществе?",
    confirmBanBody:
      "Автор не сможет добавлять записи и присоединиться снова, пока вы не вернёте участие. Уже добавленные записи остаются, пока вы их не уберёте.",
    confirmBan: "Запретить",
  },
  settings: {
    title: "Приём новых записей",
    open: "Сейчас сообщество принимает новых участников и записи.",
    closed:
      "Сейчас новые участники и записи не принимаются. Уже добавленное остаётся, обсуждения продолжаются.",
    close: "Закрыть приём",
    reopen: "Открыть приём",
    confirmCloseTitle: "Закрыть приём новых записей?",
    confirmCloseBody:
      "Никто не сможет присоединиться или добавить запись, пока вы не откроете приём снова. Уже добавленные записи и обсуждения остаются.",
    archived:
      "Сообщество в архиве: оно только для чтения, и приём здесь не меняется.",
    nowOpen: "сообщество принимает новых участников и записи",
    nowClosed: "новые участники и записи не принимаются",
  },
  comments: {
    metadataTitle: "Модерация комментариев | OverGarden",
    title: "Модерация комментариев",
    description:
      "Жалобы на комментарии к публичным записям, живым объектам и обсуждениям в сообществах. Кто пожаловался, здесь не показываем.",
    emptyOpen: "Открытых жалоб на комментарии нет.",
    emptyResolved: "Рассмотренных жалоб на комментарии пока нет.",
    removedText: "Комментарий убран с публичной страницы.",
    placeUnavailable: "Страница с этим комментарием уже не публичная.",
    targets: {
      journal_entry: "Комментарий к записи",
      lineage_object: "Комментарий к живому объекту",
      variety: "Комментарий к сорту",
      topic: "Комментарий к теме",
      community_contribution: "Комментарий в обсуждении сообщества",
    },
    actions: {
      review: "Взять в работу",
      dismiss: "Отклонить жалобу",
      remove: "Убрать комментарий",
    },
    removeTitle: "Убрать этот комментарий?",
    removeBody:
      "Комментарий исчезнет с публичной страницы, а все жалобы на него будут закрыты. Отменить это нельзя.",
    removeConfirm: "Убрать",
    nowShown: "комментарий показывается",
    nowRemoved: "комментарий убран с публичной страницы",
    accessDenied:
      "Модерировать комментарии может только владелец. Этот аккаунт им не является.",
    deniedBody: "Это действие может выполнить только владелец.",
  },
};

const COPY: Record<InterfaceLocale, ModerationCopy> = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
};

export function getModerationCopy(locale: InterfaceLocale): ModerationCopy {
  return COPY[locale];
}

/** `{name}` placeholders, filled in order of the values given. */
export function fillModerationTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
