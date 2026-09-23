import type { InterfaceLocale } from "@/lib/interface-localization";

type PluralForms = { one: string; few: string; many: string; other: string };

/**
 * A public profile's words (`OVE-494`).
 *
 * The vocabulary is the product's: an *entry* is one observation, an
 * *object* is a living subject, and an object's *journal* is its history — so
 * the tabs say "Записи" and "Об’єкти", and an object's card says it is a
 * journal of so many entries. Nothing here names how the page is built: no
 * lineage counts, no claim queues, no "hidden counters" notice.
 */
const PUBLIC_PROFILE_COPY = {
  uk: {
    profileLabel: "Профіль садівника",
    metadataSuffix: "публічний профіль",
    sectionsLabel: "Розділи профілю",
    entriesTab: "Записи",
    objectsTab: "Об’єкти",
    region: "Регіон",
    languages: "Мови",
    followers: {
      one: "підписник",
      few: "підписники",
      many: "підписників",
      other: "підписника",
    },
    following: {
      one: "підписка",
      few: "підписки",
      many: "підписок",
      other: "підписки",
    },
    follow: "Стежити",
    unfollow: "Не стежити",
    report: "Поскаржитися",
    block: "Заблокувати",
    moreActions: "Інші дії",
    manageProfile: "Редагувати профіль",
    newEntry: "Новий запис",
    addObject: "Додати об’єкт",
    publicObjects: "Об’єкти",
    publicEntries: "Записи",
    plants: "Рослини",
    animals: "Тварини",
    plant: "Рослина",
    animal: "Тварина",
    noEntries: "Опублікованих записів ще немає.",
    noOwnerEntries:
      "Тут з’являться ваші опубліковані записи. Почніть із першого.",
    noObjects: "Публічних об’єктів ще немає.",
    noOwnerObjects:
      "Об’єкт з’явиться тут, щойно ви опублікуєте про нього запис.",
    pageMissing: "На цій сторінці нічого немає.",
    firstPage: "До першої сторінки",
    entriesPages: "Сторінки записів",
    objectsPages: "Сторінки об’єктів",
    newerEntries: "Новіші",
    olderEntries: "Старіші",
    previousObjects: "Попередні",
    nextObjects: "Наступні",
    pageStatus: "Сторінка {page} з {count}",
    journal: "Журнал",
    latestEntry: "Останній запис {date}",
    reportTitle: "Причина скарги",
    reportSubmit: "Надіслати скаргу",
    reportReasons: {
      spam: "Спам",
      harassment: "Переслідування",
      privacy: "Порушення приватності",
      impersonation: "Видає себе за іншу особу",
      other: "Інше",
    },
    actionMessages: {
      followed: "Тепер ви стежите за цим профілем.",
      unfollowed: "Ви більше не стежите за цим профілем.",
      reported: "Скаргу прийнято.",
      unavailable: "Дію не виконано. Оновіть сторінку та спробуйте ще раз.",
    },
  },
  bg: {
    profileLabel: "Профил на градинар",
    metadataSuffix: "публичен профил",
    sectionsLabel: "Раздели на профила",
    entriesTab: "Записи",
    objectsTab: "Обекти",
    region: "Регион",
    languages: "Езици",
    followers: {
      one: "последовател",
      few: "последователи",
      many: "последователи",
      other: "последователи",
    },
    following: {
      one: "последван",
      few: "последвани",
      many: "последвани",
      other: "последвани",
    },
    follow: "Следвай",
    unfollow: "Спри следването",
    report: "Докладвай",
    block: "Блокирай",
    moreActions: "Други действия",
    manageProfile: "Редактирай профила",
    newEntry: "Нов запис",
    addObject: "Добави обект",
    publicObjects: "Обекти",
    publicEntries: "Записи",
    plants: "Растения",
    animals: "Животни",
    plant: "Растение",
    animal: "Животно",
    noEntries: "Все още няма публикувани записи.",
    noOwnerEntries:
      "Тук ще се появят публикуваните ви записи. Започнете с първия.",
    noObjects: "Все още няма публични обекти.",
    noOwnerObjects: "Обектът ще се появи тук, щом публикувате запис за него.",
    pageMissing: "На тази страница няма нищо.",
    firstPage: "Към първата страница",
    entriesPages: "Страници със записи",
    objectsPages: "Страници с обекти",
    newerEntries: "По-нови",
    olderEntries: "По-стари",
    previousObjects: "Предишни",
    nextObjects: "Следващи",
    pageStatus: "Страница {page} от {count}",
    journal: "Дневник",
    latestEntry: "Последен запис {date}",
    reportTitle: "Причина за доклада",
    reportSubmit: "Изпрати доклад",
    reportReasons: {
      spam: "Спам",
      harassment: "Тормоз",
      privacy: "Нарушение на поверителността",
      impersonation: "Представяне за друго лице",
      other: "Друго",
    },
    actionMessages: {
      followed: "Вече следвате този профил.",
      unfollowed: "Вече не следвате този профил.",
      reported: "Докладът е приет.",
      unavailable:
        "Действието не бе изпълнено. Обновете страницата и опитайте пак.",
    },
  },
  ru: {
    profileLabel: "Профиль садовода",
    metadataSuffix: "публичный профиль",
    sectionsLabel: "Разделы профиля",
    entriesTab: "Записи",
    objectsTab: "Объекты",
    region: "Регион",
    languages: "Языки",
    followers: {
      one: "подписчик",
      few: "подписчика",
      many: "подписчиков",
      other: "подписчика",
    },
    following: {
      one: "подписка",
      few: "подписки",
      many: "подписок",
      other: "подписки",
    },
    follow: "Следить",
    unfollow: "Не следить",
    report: "Пожаловаться",
    block: "Заблокировать",
    moreActions: "Другие действия",
    manageProfile: "Редактировать профиль",
    newEntry: "Новая запись",
    addObject: "Добавить объект",
    publicObjects: "Объекты",
    publicEntries: "Записи",
    plants: "Растения",
    animals: "Животные",
    plant: "Растение",
    animal: "Животное",
    noEntries: "Опубликованных записей пока нет.",
    noOwnerEntries:
      "Здесь появятся ваши опубликованные записи. Начните с первой.",
    noObjects: "Публичных объектов пока нет.",
    noOwnerObjects:
      "Объект появится здесь, как только вы опубликуете о нём запись.",
    pageMissing: "На этой странице ничего нет.",
    firstPage: "К первой странице",
    entriesPages: "Страницы записей",
    objectsPages: "Страницы объектов",
    newerEntries: "Более новые",
    olderEntries: "Более ранние",
    previousObjects: "Предыдущие",
    nextObjects: "Следующие",
    pageStatus: "Страница {page} из {count}",
    journal: "Журнал",
    latestEntry: "Последняя запись {date}",
    reportTitle: "Причина жалобы",
    reportSubmit: "Отправить жалобу",
    reportReasons: {
      spam: "Спам",
      harassment: "Преследование",
      privacy: "Нарушение приватности",
      impersonation: "Выдаёт себя за другого человека",
      other: "Другое",
    },
    actionMessages: {
      followed: "Теперь вы следите за этим профилем.",
      unfollowed: "Вы больше не следите за этим профилем.",
      reported: "Жалоба принята.",
      unavailable:
        "Действие не выполнено. Обновите страницу и попробуйте снова.",
    },
  },
} satisfies Record<
  InterfaceLocale,
  { followers: PluralForms; following: PluralForms } & Record<string, unknown>
>;

export function getPublicProfileCopy(locale: InterfaceLocale) {
  return PUBLIC_PROFILE_COPY[locale];
}

/** "12 підписників", in the reader's language and its plural rules. */
export function formatPublicProfileCount(
  locale: InterfaceLocale,
  kind: "followers" | "following",
  count: number,
) {
  const forms = PUBLIC_PROFILE_COPY[locale][kind];
  const category = new Intl.PluralRules(locale).select(count);
  return `${count} ${forms[category as keyof PluralForms] ?? forms.other}`;
}

export const PUBLIC_PROFILE_LANGUAGE_LABELS: Record<
  InterfaceLocale,
  Record<"uk" | "bg" | "ru" | "en", string>
> = {
  uk: { uk: "Українська", bg: "Български", ru: "Російська", en: "English" },
  bg: { uk: "Українська", bg: "Български", ru: "Русский", en: "English" },
  ru: { uk: "Українська", bg: "Български", ru: "Русский", en: "English" },
};
