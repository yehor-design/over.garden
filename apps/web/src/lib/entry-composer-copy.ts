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
    addSpace: string;
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
  /**
   * A link that named a place to write which is not there (`OVE-501`): a
   * reminder opened after its plant was deleted, an old bookmark. The picker
   * opens as before, and now says why.
   */
  destinationNotice: {
    object: string;
    space: string;
    unavailable: string;
  };
  /**
   * A plant or animal the gardener does not have yet, named while writing
   * (`OVE-478`, FAST_ENTRY "Creating during writing"). Nothing is created
   * before Publish: the new one and its first entry are acknowledged together.
   */
  newObject: {
    title: string;
    help: string;
    name: string;
    kind: string;
    plant: string;
    animal: string;
    space: string;
    existingSpace: string;
    newSpace: string;
    newSpaceName: string;
    back: string;
    nameRequired: string;
    spaceRequired: string;
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
    body: "Запис належить рослині, тварині чи простору.",
    addObject: "Додати рослину чи тварину",
    addSpace: "Створити простір",
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
  destinationNotice: {
    object:
      "Рослини чи тварини з цього посилання немає у вашому саду — можливо, її видалили. Оберіть, про що записати.",
    space:
      "Простору з цього посилання немає у вашому саду — можливо, його видалили. Оберіть, куди записати.",
    unavailable:
      "Не вдалося відкрити місце з цього посилання. Оберіть його нижче або спробуйте ще раз пізніше.",
  },
  newObject: {
    title: "Нова рослина чи тварина",
    help: "Вона з’явиться у вашому саду разом із цим записом, коли ви його опублікуєте. До того нічого не збережено.",
    name: "Назва",
    kind: "Це",
    plant: "Рослина",
    animal: "Тварина",
    space: "Де вона",
    existingSpace: "У моєму просторі",
    newSpace: "У новому просторі",
    newSpaceName: "Назва нового простору",
    back: "Обрати наявну",
    nameRequired: "Назвіть рослину чи тварину.",
    spaceRequired: "Оберіть простір або назвіть новий.",
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
    body: "Записът принадлежи на растение, животно или пространство.",
    addObject: "Добави растение или животно",
    addSpace: "Създай пространство",
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
  destinationNotice: {
    object:
      "Растението или животното от тази връзка не е във вашата градина — може да е изтрито. Изберете за какво да пишете.",
    space:
      "Пространството от тази връзка не е във вашата градина — може да е изтрито. Изберете къде да пишете.",
    unavailable:
      "Мястото от тази връзка не можа да се отвори. Изберете го по-долу или опитайте отново по-късно.",
  },
  newObject: {
    title: "Ново растение или животно",
    help: "Ще се появи в градината ви заедно с този запис, когато го публикувате. Дотогава нищо не е запазено.",
    name: "Име",
    kind: "Това е",
    plant: "Растение",
    animal: "Животно",
    space: "Къде е",
    existingSpace: "В мое пространство",
    newSpace: "В ново пространство",
    newSpaceName: "Име на новото пространство",
    back: "Изберете съществуващо",
    nameRequired: "Дайте име на растението или животното.",
    spaceRequired: "Изберете пространство или дайте име на ново.",
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
    body: "Запись принадлежит растению, животному или пространству.",
    addObject: "Добавить растение или животное",
    addSpace: "Создать пространство",
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
  destinationNotice: {
    object:
      "Растения или животного из этой ссылки нет в вашем саду — возможно, его удалили. Выберите, о чём написать.",
    space:
      "Пространства из этой ссылки нет в вашем саду — возможно, его удалили. Выберите, куда написать.",
    unavailable:
      "Не удалось открыть место из этой ссылки. Выберите его ниже или попробуйте ещё раз позже.",
  },
  newObject: {
    title: "Новое растение или животное",
    help: "Оно появится в вашем саду вместе с этой записью, когда вы её опубликуете. До этого ничего не сохранено.",
    name: "Название",
    kind: "Это",
    plant: "Растение",
    animal: "Животное",
    space: "Где оно",
    existingSpace: "В моём пространстве",
    newSpace: "В новом пространстве",
    newSpaceName: "Название нового пространства",
    back: "Выбрать существующее",
    nameRequired: "Назовите растение или животное.",
    spaceRequired: "Выберите пространство или назовите новое.",
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
