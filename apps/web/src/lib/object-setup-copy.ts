import type { PlantObjectKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";

type ByKind = Record<PlantObjectKind, string>;

/**
 * The words of the object stepper (OVE-524, DESIGN.md §5.24, §5.28): one
 * question per screen — «Простір», «Рослина чи тварина?», a photo, the name,
 * «Вид», «Сорт» / «Порода» — and «Додати». Defaults are answers, never hints:
 * «Не знаю» is an option, a field carries no helper text, and a search field
 * shows one short example.
 */
export interface ObjectSetupCopy {
  title: string;
  back: string;
  close: string;
  stepOf: (step: number, total: number) => string;
  next: string;
  previous: string;
  add: string;
  adding: string;
  space: {
    question: string;
    listLabel: string;
    addSpace: string;
    required: string;
    photoAlt: (name: string) => string;
  };
  kind: {
    question: string;
    plant: string;
    animal: string;
  };
  photo: {
    question: ByKind;
    alt: (name: string) => string;
    skip: string;
  };
  name: {
    question: ByKind;
    label: string;
    placeholder: ByKind;
    required: string;
    tooLong: string;
  };
  species: {
    question: string;
    searchLabel: string;
    placeholder: ByKind;
    listLabel: string;
    unknown: string;
    own: string;
    ownLabel: string;
    ownRequired: string;
    tooLong: string;
    searching: string;
    empty: string;
    unavailable: string;
    resultCount: (count: number) => string;
    clear: string;
  };
  cultivar: {
    question: ByKind;
    searchLabel: ByKind;
    listLabel: ByKind;
    unknown: string;
    add: (name: string) => string;
    ownLabel: ByKind;
    ownRequired: string;
    tooLong: string;
    loading: string;
    unavailable: string;
    clear: string;
  };
  discard: {
    title: string;
    body: string;
    keep: string;
    leave: string;
  };
  duplicate: {
    title: (name: string, space: string) => string;
    body: string;
    openExisting: string;
    createAnyway: string;
  };
  result: {
    failed: string;
    uncertain: string;
    conflict: string;
    signedOut: string;
    signIn: string;
    spaceUnavailable: string;
    identityUnavailable: string;
  };
}

const uk: ObjectSetupCopy = {
  title: "Нова рослина чи тварина",
  back: "До мого саду",
  close: "Закрити",
  stepOf: (step, total) => `Крок ${step} з ${total}`,
  next: "Далі",
  previous: "Назад",
  add: "Додати",
  adding: "Додаємо…",
  space: {
    question: "Простір",
    listLabel: "Ваші простори",
    addSpace: "Додати простір",
    required: "Виберіть простір.",
    photoAlt: (name) => `Фото простору «${name}»`,
  },
  kind: {
    question: "Рослина чи тварина?",
    plant: "Рослина",
    animal: "Тварина",
  },
  photo: {
    question: {
      plant: "Додайте фото рослини",
      animal: "Додайте фото тварини",
    },
    alt: (name) => `Фото «${name}»`,
    skip: "Пропустити",
  },
  name: {
    question: {
      plant: "Вкажіть ім'я рослини",
      animal: "Вкажіть ім'я тварини",
    },
    label: "Ім'я",
    placeholder: { plant: "Бабусині помідори", animal: "Рябка" },
    required: "Вкажіть ім'я.",
    tooLong: "Ім'я має бути не довшим за 120 символів.",
  },
  species: {
    question: "Вид",
    searchLabel: "Пошук виду",
    placeholder: { plant: "Наприклад, помідор", animal: "Наприклад, курка" },
    listLabel: "Вид",
    unknown: "Не знаю",
    own: "Ввести свій варіант",
    ownLabel: "Ваш варіант",
    ownRequired: "Введіть свій варіант або виберіть «Не знаю».",
    tooLong: "Не довше за 120 символів.",
    searching: "Шукаємо…",
    empty: "У переліку такого немає. Можна ввести свій варіант.",
    unavailable:
      "Пошук зараз недоступний. Можна ввести свій варіант або вибрати «Не знаю».",
    resultCount: (count) => `Знайдено: ${count}`,
    clear: "Очистити пошук",
  },
  cultivar: {
    question: { plant: "Сорт", animal: "Порода" },
    searchLabel: { plant: "Пошук сорту", animal: "Пошук породи" },
    listLabel: { plant: "Сорт", animal: "Порода" },
    unknown: "Не знаю",
    add: (name) => `Додати «${name}»`,
    ownLabel: { plant: "Ваш варіант сорту", animal: "Ваш варіант породи" },
    ownRequired: "Введіть свій варіант або виберіть «Не знаю».",
    tooLong: "Не довше за 120 символів.",
    loading: "Завантажуємо перелік…",
    unavailable:
      "Перелік зараз недоступний. Можна вибрати «Не знаю» або додати свій.",
    clear: "Очистити пошук",
  },
  discard: {
    title: "Вийти з додавання?",
    body: "Ваші відповіді й фото не збережуться.",
    keep: "Продовжити",
    leave: "Вийти",
  },
  duplicate: {
    title: (name, space) => `У просторі «${space}» уже є «${name}»`,
    body: "Можна відкрити наявну або додати ще одну з таким самим ім'ям.",
    openExisting: "Відкрити наявну",
    createAnyway: "Додати ще одну",
  },
  result: {
    failed: "Не вдалося додати. Ваші відповіді збережено — спробуйте ще раз.",
    uncertain:
      "Не вдалося дізнатися, чи додано. Спробуйте ще раз — другої не з'явиться.",
    conflict: "Цей запит уже використано. Почніть додавання заново.",
    signedOut: "Сеанс завершився. Увійдіть знову, щоб додати.",
    signIn: "Увійти",
    spaceUnavailable: "Цього простору вже немає. Виберіть інший.",
    identityUnavailable:
      "Вибраного виду чи сорту вже немає в переліку. Виберіть знову.",
  },
};

const bg: ObjectSetupCopy = {
  title: "Ново растение или животно",
  back: "Към моята градина",
  close: "Затвори",
  stepOf: (step, total) => `Стъпка ${step} от ${total}`,
  next: "Напред",
  previous: "Назад",
  add: "Добави",
  adding: "Добавяме…",
  space: {
    question: "Пространство",
    listLabel: "Вашите пространства",
    addSpace: "Добави пространство",
    required: "Изберете пространство.",
    photoAlt: (name) => `Снимка на пространството „${name}“`,
  },
  kind: {
    question: "Растение или животно?",
    plant: "Растение",
    animal: "Животно",
  },
  photo: {
    question: {
      plant: "Добавете снимка на растението",
      animal: "Добавете снимка на животното",
    },
    alt: (name) => `Снимка на „${name}“`,
    skip: "Пропусни",
  },
  name: {
    question: {
      plant: "Посочете името на растението",
      animal: "Посочете името на животното",
    },
    label: "Име",
    placeholder: { plant: "Бабините домати", animal: "Шарка" },
    required: "Посочете име.",
    tooLong: "Името трябва да е до 120 знака.",
  },
  species: {
    question: "Вид",
    searchLabel: "Търсене на вид",
    placeholder: { plant: "Например, домат", animal: "Например, кокошка" },
    listLabel: "Вид",
    unknown: "Не знам",
    own: "Въведете свой вариант",
    ownLabel: "Вашият вариант",
    ownRequired: "Въведете свой вариант или изберете „Не знам“.",
    tooLong: "До 120 знака.",
    searching: "Търсим…",
    empty: "В списъка няма такъв. Можете да въведете свой вариант.",
    unavailable:
      "Търсенето в момента не работи. Можете да въведете свой вариант или да изберете „Не знам“.",
    resultCount: (count) => `Намерени: ${count}`,
    clear: "Изчисти търсенето",
  },
  cultivar: {
    question: { plant: "Сорт", animal: "Порода" },
    searchLabel: { plant: "Търсене на сорт", animal: "Търсене на порода" },
    listLabel: { plant: "Сорт", animal: "Порода" },
    unknown: "Не знам",
    add: (name) => `Добави „${name}“`,
    ownLabel: {
      plant: "Вашият вариант на сорта",
      animal: "Вашият вариант на породата",
    },
    ownRequired: "Въведете свой вариант или изберете „Не знам“.",
    tooLong: "До 120 знака.",
    loading: "Зареждаме списъка…",
    unavailable:
      "Списъкът в момента не е достъпен. Можете да изберете „Не знам“ или да добавите свой.",
    clear: "Изчисти търсенето",
  },
  discard: {
    title: "Да излезете ли от добавянето?",
    body: "Отговорите и снимката няма да се запазят.",
    keep: "Продължи",
    leave: "Излез",
  },
  duplicate: {
    title: (name, space) => `В пространството „${space}“ вече има „${name}“`,
    body: "Можете да отворите съществуващото или да добавите още едно със същото име.",
    openExisting: "Отвори съществуващото",
    createAnyway: "Добави още едно",
  },
  result: {
    failed: "Добавянето не успя. Отговорите ви са запазени — опитайте отново.",
    uncertain:
      "Не успяхме да разберем дали е добавено. Опитайте отново — второ няма да се появи.",
    conflict: "Тази заявка вече е използвана. Започнете добавянето отначало.",
    signedOut: "Сесията изтече. Влезте отново, за да добавите.",
    signIn: "Вход",
    spaceUnavailable: "Това пространство вече го няма. Изберете друго.",
    identityUnavailable:
      "Избраният вид или сорт вече не е в списъка. Изберете отново.",
  },
};

const ru: ObjectSetupCopy = {
  title: "Новое растение или животное",
  back: "В мой сад",
  close: "Закрыть",
  stepOf: (step, total) => `Шаг ${step} из ${total}`,
  next: "Далее",
  previous: "Назад",
  add: "Добавить",
  adding: "Добавляем…",
  space: {
    question: "Пространство",
    listLabel: "Ваши пространства",
    addSpace: "Добавить пространство",
    required: "Выберите пространство.",
    photoAlt: (name) => `Фото пространства «${name}»`,
  },
  kind: {
    question: "Растение или животное?",
    plant: "Растение",
    animal: "Животное",
  },
  photo: {
    question: {
      plant: "Добавьте фото растения",
      animal: "Добавьте фото животного",
    },
    alt: (name) => `Фото «${name}»`,
    skip: "Пропустить",
  },
  name: {
    question: {
      plant: "Укажите имя растения",
      animal: "Укажите имя животного",
    },
    label: "Имя",
    placeholder: { plant: "Бабушкины помидоры", animal: "Рябушка" },
    required: "Укажите имя.",
    tooLong: "Имя должно быть не длиннее 120 символов.",
  },
  species: {
    question: "Вид",
    searchLabel: "Поиск вида",
    placeholder: { plant: "Например, помидор", animal: "Например, курица" },
    listLabel: "Вид",
    unknown: "Не знаю",
    own: "Ввести свой вариант",
    ownLabel: "Ваш вариант",
    ownRequired: "Введите свой вариант или выберите «Не знаю».",
    tooLong: "Не длиннее 120 символов.",
    searching: "Ищем…",
    empty: "В списке такого нет. Можно ввести свой вариант.",
    unavailable:
      "Поиск сейчас недоступен. Можно ввести свой вариант или выбрать «Не знаю».",
    resultCount: (count) => `Найдено: ${count}`,
    clear: "Очистить поиск",
  },
  cultivar: {
    question: { plant: "Сорт", animal: "Порода" },
    searchLabel: { plant: "Поиск сорта", animal: "Поиск породы" },
    listLabel: { plant: "Сорт", animal: "Порода" },
    unknown: "Не знаю",
    add: (name) => `Добавить «${name}»`,
    ownLabel: { plant: "Ваш вариант сорта", animal: "Ваш вариант породы" },
    ownRequired: "Введите свой вариант или выберите «Не знаю».",
    tooLong: "Не длиннее 120 символов.",
    loading: "Загружаем список…",
    unavailable:
      "Список сейчас недоступен. Можно выбрать «Не знаю» или добавить свой.",
    clear: "Очистить поиск",
  },
  discard: {
    title: "Выйти из добавления?",
    body: "Ваши ответы и фото не сохранятся.",
    keep: "Продолжить",
    leave: "Выйти",
  },
  duplicate: {
    title: (name, space) => `В пространстве «${space}» уже есть «${name}»`,
    body: "Можно открыть существующее или добавить ещё одно с таким же именем.",
    openExisting: "Открыть существующее",
    createAnyway: "Добавить ещё одно",
  },
  result: {
    failed: "Не удалось добавить. Ваши ответы сохранены — попробуйте ещё раз.",
    uncertain:
      "Не удалось узнать, добавлено ли. Попробуйте ещё раз — второго не появится.",
    conflict: "Этот запрос уже использован. Начните добавление заново.",
    signedOut: "Сеанс завершился. Войдите снова, чтобы добавить.",
    signIn: "Войти",
    spaceUnavailable: "Этого пространства уже нет. Выберите другое.",
    identityUnavailable:
      "Выбранного вида или сорта уже нет в списке. Выберите снова.",
  },
};

const COPY: Record<InterfaceLocale, ObjectSetupCopy> = { uk, bg, ru };

export function getObjectSetupCopy(locale: InterfaceLocale): ObjectSetupCopy {
  return COPY[locale];
}
