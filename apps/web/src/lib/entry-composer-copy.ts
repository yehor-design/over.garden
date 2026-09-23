import type { InterfaceLocale } from "@/lib/interface-localization";

/** The words the one entry composer adds to the workspace copy (`OVE-486`). */
export interface EntryComposerCopy {
  title: string;
  writingTo: string;
  change: string;
  keep: string;
  publicBadge: string;
  date: string;
  dateHelp: string;
  chooseFirst: string;
  whatHappened: { object: string; space: string };
  spaceMentions: {
    label: string;
    help: string;
    required: string;
    none: string;
    addObject: string;
    search: string;
    loading: string;
    unavailable: string;
  };
  sessionEnded: string;
  signInNewTab: string;
  close: string;
  empty: {
    title: string;
    body: string;
    addObject: string;
    firstEntry: string;
  };
  /**
   * Writing for a community (`OVE-500`): which one, what happens after
   * Publish, and why only a plant or an animal can be chosen.
   */
  community: {
    title: (name: string) => string;
    body: string;
    notMember: string;
    closed: (name: string) => string;
    banned: (name: string) => string;
    back: string;
  };
}

const uk: EntryComposerCopy = {
  title: "Новий запис",
  writingTo: "Запис у",
  change: "Змінити",
  keep: "Залишити",
  publicBadge: "Публічний після публікації",
  date: "Дата спостереження",
  dateHelp: "Дата за вашим місцевим часом.",
  chooseFirst: "Спершу оберіть, куди записати.",
  whatHappened: {
    object: "Що змінилося?",
    space: "Що відбувається в цьому просторі?",
  },
  spaceMentions: {
    label: "Про кого цей запис?",
    help: "Запис простору згадує від однієї до дванадцяти його рослин чи тварин.",
    required: "Позначте хоча б одну рослину чи тварину цього простору.",
    none: "У цьому просторі ще немає рослин чи тварин, а запис простору згадує хоча б одну.",
    addObject: "Додати рослину чи тварину",
    search: "Знайти в цьому просторі",
    loading: "Завантажуємо…",
    unavailable: "Не вдалося завантажити список. Текст залишився на екрані.",
  },
  sessionEnded:
    "Сесія завершилася, і запис не опубліковано. Увійдіть у новій вкладці й натисніть «Опублікувати» ще раз — текст залишиться тут.",
  signInNewTab: "Увійти в новій вкладці",
  close: "Закрити",
  empty: {
    title: "Спершу додайте, про що писатимете",
    body: "Запис належить рослині, тварині чи простору. Додайте першу — або напишіть перший запис одразу разом із нею.",
    addObject: "Додати рослину чи тварину",
    firstEntry: "Написати перший запис",
  },
  community: {
    title: (name) => `Запис для спільноти «${name}»`,
    body: "Оберіть свою рослину чи тварину — до спільноти додаються записи про одну з них. Після публікації ви повернетеся до спільноти, і запис буде першим у виборі.",
    notMember:
      "Щоб додати запис, там доведеться приєднатися до спільноти — це одна дія.",
    closed: (name) =>
      `Спільнота «${name}» зараз не приймає нових записів. Запис опублікується лише у вашому журналі.`,
    banned: (name) =>
      `Модератор обмежив вашу участь у спільноті «${name}», тож додати туди запис не вийде. Запис опублікується лише у вашому журналі.`,
    back: "Повернутися до спільноти",
  },
};

const bg: EntryComposerCopy = {
  title: "Нов запис",
  writingTo: "Запис в",
  change: "Промени",
  keep: "Остави",
  publicBadge: "Публичен след публикуване",
  date: "Дата на наблюдението",
  dateHelp: "Датата по вашето местно време.",
  chooseFirst: "Първо изберете къде да запишете.",
  whatHappened: {
    object: "Какво се промени?",
    space: "Какво се случва в това пространство?",
  },
  spaceMentions: {
    label: "За кого е записът?",
    help: "Записът на пространството споменава от едно до дванадесет негови растения или животни.",
    required: "Отбележете поне едно растение или животно от това пространство.",
    none: "В това пространство още няма растения или животни, а записът на пространството споменава поне едно.",
    addObject: "Добави растение или животно",
    search: "Търсене в това пространство",
    loading: "Зареждаме…",
    unavailable: "Списъкът не се зареди. Текстът остава на екрана.",
  },
  sessionEnded:
    "Сесията изтече и записът не е публикуван. Влезте в нов раздел и натиснете „Публикувай“ отново — текстът остава тук.",
  signInNewTab: "Вход в нов раздел",
  close: "Затвори",
  empty: {
    title: "Първо добавете за какво ще пишете",
    body: "Записът принадлежи на растение, животно или пространство. Добавете първото — или напишете първия запис заедно с него.",
    addObject: "Добави растение или животно",
    firstEntry: "Напиши първия запис",
  },
  community: {
    title: (name) => `Запис за общността „${name}“`,
    body: "Изберете свое растение или животно — в общността се добавят записи за едно от тях. След публикуването ще се върнете в общността и записът ще е първи в избора.",
    notMember:
      "За да добавите записа, там ще трябва да се присъедините към общността — това е едно действие.",
    closed: (name) =>
      `Общността „${name}“ в момента не приема нови записи. Записът ще се публикува само в дневника ви.`,
    banned: (name) =>
      `Модератор е ограничил участието ви в общността „${name}“, затова не можете да добавите запис там. Записът ще се публикува само в дневника ви.`,
    back: "Обратно към общността",
  },
};

const ru: EntryComposerCopy = {
  title: "Новая запись",
  writingTo: "Запись в",
  change: "Изменить",
  keep: "Оставить",
  publicBadge: "Публичная после публикации",
  date: "Дата наблюдения",
  dateHelp: "Дата по вашему местному времени.",
  chooseFirst: "Сначала выберите, куда записать.",
  whatHappened: {
    object: "Что изменилось?",
    space: "Что происходит в этом пространстве?",
  },
  spaceMentions: {
    label: "О ком эта запись?",
    help: "Запись пространства упоминает от одного до двенадцати его растений или животных.",
    required: "Отметьте хотя бы одно растение или животное этого пространства.",
    none: "В этом пространстве ещё нет растений или животных, а запись пространства упоминает хотя бы одно.",
    addObject: "Добавить растение или животное",
    search: "Найти в этом пространстве",
    loading: "Загружаем…",
    unavailable: "Не удалось загрузить список. Текст остался на экране.",
  },
  sessionEnded:
    "Сессия завершилась, и запись не опубликована. Войдите в новой вкладке и нажмите «Опубликовать» ещё раз — текст останется здесь.",
  signInNewTab: "Войти в новой вкладке",
  close: "Закрыть",
  empty: {
    title: "Сначала добавьте, о чём будете писать",
    body: "Запись принадлежит растению, животному или пространству. Добавьте первое — или напишите первую запись сразу вместе с ним.",
    addObject: "Добавить растение или животное",
    firstEntry: "Написать первую запись",
  },
  community: {
    title: (name) => `Запись для сообщества «${name}»`,
    body: "Выберите своё растение или животное — в сообщество добавляются записи об одном из них. После публикации вы вернётесь в сообщество, и запись будет первой в выборе.",
    notMember:
      "Чтобы добавить запись, там нужно будет присоединиться к сообществу — это одно действие.",
    closed: (name) =>
      `Сообщество «${name}» сейчас не принимает новые записи. Запись опубликуется только в вашем журнале.`,
    banned: (name) =>
      `Модератор ограничил ваше участие в сообществе «${name}», поэтому добавить туда запись не получится. Запись опубликуется только в вашем журнале.`,
    back: "Вернуться в сообщество",
  },
};

const COPY: Record<InterfaceLocale, EntryComposerCopy> = { uk, bg, ru };

export function getEntryComposerCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

/** Today in the reader's own timezone, as the `YYYY-MM-DD` a date input holds. */
export function localCalendarDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
