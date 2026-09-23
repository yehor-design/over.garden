import type { InterfaceLocale } from "@/lib/interface-localization";

export interface SpaceSetupCopy {
  title: string;
  intro: string;
  back: string;
  close: string;
  stepOf: (step: number, total: number) => string;
  change: string;
  next: string;
  previous: string;
  optional: string;
  name: {
    question: string;
    label: string;
    hint: string;
    placeholder: string;
    required: string;
    tooLong: string;
  };
  region: {
    question: string;
    hint: string;
    hidden: string;
    hiddenDescription: string;
    shown: string;
    shownDescription: string;
    select: string;
    choose: string;
    required: string;
    invalid: string;
    skip: string;
    summaryHidden: string;
  };
  review: {
    question: string;
    willCreate: string;
    visibility: string;
    notAnEntry: string;
    create: string;
    creating: string;
    useInEntry: string;
    proposeNote: string;
  };
  duplicate: {
    title: (name: string) => string;
    body: string;
    openExisting: string;
    createAnyway: string;
  };
  result: {
    created: (name: string) => string;
    createdBody: string;
    replayed: string;
    toGarden: string;
    /** The new space's own page (`OVE-490`). */
    openSpace: string;
    continue: string;
    failed: string;
    uncertain: string;
    retry: string;
    conflict: string;
    signedOut: string;
  };
}

const uk: SpaceSetupCopy = {
  title: "Новий простір",
  intro:
    "Простір об'єднує рослини й тварини, що живуть поруч: теплицю, балкон, пасіку.",
  back: "До мого саду",
  close: "Закрити",
  stepOf: (step, total) => `Крок ${step} з ${total}`,
  change: "Змінити",
  next: "Далі",
  previous: "Назад",
  optional: "необов'язково",
  name: {
    question: "Як називається простір?",
    label: "Назва простору",
    hint: "Так, як ви його називаєте самі.",
    placeholder: "Теплиця за будинком",
    required: "Введіть назву простору.",
    tooLong: "Назва має бути не довшою за 120 символів.",
  },
  region: {
    question: "Чи показувати регіон?",
    hint: "Точне місце ніколи не запитується й не зберігається.",
    hidden: "Не показувати",
    hiddenDescription: "Публічні сторінки не показують, де цей простір.",
    shown: "Показувати область",
    shownDescription: "Біля опублікованих записів може з'явитися лише область.",
    select: "Область",
    choose: "Оберіть область",
    required: "Оберіть область або виберіть «Не показувати».",
    invalid: "Оберіть область зі списку.",
    skip: "Пропустити",
    summaryHidden: "Регіон не показується",
  },
  review: {
    question: "Перевірте й створіть",
    willCreate: "Буде створено порожній простір",
    visibility:
      "Сам простір не має публічної сторінки. Його назву можуть бачити біля записів, які ви опублікуєте в ньому.",
    notAnEntry: "Створення простору не публікує жодного запису.",
    create: "Створити простір",
    creating: "Створюємо…",
    useInEntry: "Використати в записі",
    proposeNote:
      "Простір буде створено разом із записом, коли ви його опублікуєте. Якщо публікація не вдасться, не з'явиться ні простір, ні запис.",
  },
  duplicate: {
    title: (name) => `У вас уже є простір «${name}»`,
    body: "Можна відкрити наявний або створити другий з такою самою назвою.",
    openExisting: "Відкрити наявний",
    createAnyway: "Створити ще один",
  },
  result: {
    created: (name) => `Простір «${name}» створено`,
    createdBody:
      "Він порожній. Записи в ньому з'являться, коли ви їх опублікуєте.",
    replayed: "Цей простір уже було створено цим запитом — другий не з'явився.",
    toGarden: "До мого саду",
    openSpace: "Відкрити простір",
    continue: "Повернутися",
    failed:
      "Не вдалося створити простір. Ваші відповіді збережено на цій сторінці.",
    uncertain:
      "Не вдалося дізнатися, чи простір створено. Повторіть — той самий запит не створить другого.",
    retry: "Повторити",
    conflict: "Цей запит уже використано. Оновіть сторінку й спробуйте ще раз.",
    signedOut:
      "Сесія завершилася. Увійдіть знову — відповіді на цій сторінці залишаться до перезавантаження.",
  },
};

const bg: SpaceSetupCopy = {
  title: "Ново пространство",
  intro:
    "Пространството събира растения и животни, които живеят заедно: оранжерия, балкон, пчелин.",
  back: "Към моята градина",
  close: "Затвори",
  stepOf: (step, total) => `Стъпка ${step} от ${total}`,
  change: "Промени",
  next: "Напред",
  previous: "Назад",
  optional: "по избор",
  name: {
    question: "Как се казва пространството?",
    label: "Име на пространството",
    hint: "Така, както вие го наричате.",
    placeholder: "Оранжерията зад къщата",
    required: "Въведете име на пространството.",
    tooLong: "Името трябва да е до 120 знака.",
  },
  region: {
    question: "Да се показва ли регионът?",
    hint: "Точното място никога не се иска и не се пази.",
    hidden: "Не показвай",
    hiddenDescription:
      "Публичните страници не показват къде е това пространство.",
    shown: "Показвай областта",
    shownDescription: "До публикуваните записи може да се появи само областта.",
    select: "Област",
    choose: "Изберете област",
    required: "Изберете област или „Не показвай“.",
    invalid: "Изберете област от списъка.",
    skip: "Пропусни",
    summaryHidden: "Регионът не се показва",
  },
  review: {
    question: "Проверете и създайте",
    willCreate: "Ще бъде създадено празно пространство",
    visibility:
      "Самото пространство няма публична страница. Името му може да се вижда до записите, които публикувате в него.",
    notAnEntry: "Създаването на пространство не публикува запис.",
    create: "Създай пространството",
    creating: "Създаваме…",
    useInEntry: "Използвай в записа",
    proposeNote:
      "Пространството ще бъде създадено заедно със записа, когато го публикувате. Ако публикуването не успее, няма да се появи нито пространство, нито запис.",
  },
  duplicate: {
    title: (name) => `Вече имате пространство „${name}“`,
    body: "Можете да отворите съществуващото или да създадете второ със същото име.",
    openExisting: "Отвори съществуващото",
    createAnyway: "Създай още едно",
  },
  result: {
    created: (name) => `Пространството „${name}“ е създадено`,
    createdBody:
      "То е празно. Записите в него ще се появят, когато ги публикувате.",
    replayed:
      "Това пространство вече е създадено от същата заявка — второ не се появи.",
    toGarden: "Към моята градина",
    openSpace: "Отвори пространството",
    continue: "Връщане",
    failed:
      "Пространството не беше създадено. Отговорите ви са запазени на тази страница.",
    uncertain:
      "Не успяхме да разберем дали пространството е създадено. Опитайте отново — същата заявка няма да създаде второ.",
    retry: "Опитай отново",
    conflict:
      "Тази заявка вече е използвана. Презаредете страницата и опитайте отново.",
    signedOut:
      "Сесията изтече. Влезте отново — отговорите остават на страницата до презареждане.",
  },
};

const ru: SpaceSetupCopy = {
  title: "Новое пространство",
  intro:
    "Пространство объединяет растения и животных, которые живут рядом: теплицу, балкон, пасеку.",
  back: "К моему саду",
  close: "Закрыть",
  stepOf: (step, total) => `Шаг ${step} из ${total}`,
  change: "Изменить",
  next: "Далее",
  previous: "Назад",
  optional: "необязательно",
  name: {
    question: "Как называется пространство?",
    label: "Название пространства",
    hint: "Так, как вы его называете сами.",
    placeholder: "Теплица за домом",
    required: "Введите название пространства.",
    tooLong: "Название должно быть не длиннее 120 символов.",
  },
  region: {
    question: "Показывать ли регион?",
    hint: "Точное место никогда не запрашивается и не хранится.",
    hidden: "Не показывать",
    hiddenDescription:
      "Публичные страницы не показывают, где это пространство.",
    shown: "Показывать область",
    shownDescription:
      "Рядом с опубликованными записями может появиться только область.",
    select: "Область",
    choose: "Выберите область",
    required: "Выберите область или «Не показывать».",
    invalid: "Выберите область из списка.",
    skip: "Пропустить",
    summaryHidden: "Регион не показывается",
  },
  review: {
    question: "Проверьте и создайте",
    willCreate: "Будет создано пустое пространство",
    visibility:
      "У самого пространства нет публичной страницы. Его название могут видеть рядом с записями, которые вы опубликуете в нём.",
    notAnEntry: "Создание пространства не публикует ни одной записи.",
    create: "Создать пространство",
    creating: "Создаём…",
    useInEntry: "Использовать в записи",
    proposeNote:
      "Пространство будет создано вместе с записью, когда вы её опубликуете. Если публикация не удастся, не появится ни пространство, ни запись.",
  },
  duplicate: {
    title: (name) => `У вас уже есть пространство «${name}»`,
    body: "Можно открыть существующее или создать второе с таким же названием.",
    openExisting: "Открыть существующее",
    createAnyway: "Создать ещё одно",
  },
  result: {
    created: (name) => `Пространство «${name}» создано`,
    createdBody: "Оно пустое. Записи в нём появятся, когда вы их опубликуете.",
    replayed:
      "Это пространство уже было создано этим запросом — второе не появилось.",
    toGarden: "К моему саду",
    openSpace: "Открыть пространство",
    continue: "Вернуться",
    failed:
      "Не удалось создать пространство. Ваши ответы сохранены на этой странице.",
    uncertain:
      "Не удалось узнать, создано ли пространство. Повторите — тот же запрос не создаст второе.",
    retry: "Повторить",
    conflict:
      "Этот запрос уже использован. Обновите страницу и попробуйте снова.",
    signedOut:
      "Сессия завершилась. Войдите снова — ответы на странице останутся до перезагрузки.",
  },
};

const COPY: Record<InterfaceLocale, SpaceSetupCopy> = { uk, bg, ru };

export function getSpaceSetupCopy(locale: InterfaceLocale): SpaceSetupCopy {
  return COPY[locale];
}
