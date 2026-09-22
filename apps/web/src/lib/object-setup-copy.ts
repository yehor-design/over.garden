import type { InterfaceLocale } from "@/lib/interface-localization";

export interface ObjectSetupCopy {
  title: string;
  intro: string;
  back: string;
  stepOf: (step: number, total: number) => string;
  change: string;
  next: string;
  previous: string;
  kind: {
    question: string;
    plant: string;
    plantDescription: string;
    animal: string;
    animalDescription: string;
    summary: { plant: string; animal: string };
  };
  name: {
    question: { plant: string; animal: string };
    label: string;
    hint: { plant: string; animal: string };
    placeholder: { plant: string; animal: string };
    required: string;
    tooLong: string;
    keepWithoutMatch: string;
    noMatch: string;
    organism: (name: string) => string;
    ownLabel: (name: string) => string;
    sharedOrganismNote: string;
  };
  space: {
    question: string;
    hint: string;
    required: string;
    create: string;
    sheetTitle: string;
    close: string;
    created: (name: string) => string;
  };
  review: {
    question: string;
    willCreate: { plant: string; animal: string };
    identity: string;
    notIdentified: string;
    space: string;
    publishesNothing: string;
    create: string;
    creating: string;
  };
  matches: {
    title: (name: string) => string;
    body: string;
    write: string;
    inSpace: (space: string) => string;
    addAnother: string;
  };
  duplicate: {
    title: (name: string, space: string) => string;
    body: string;
    openExisting: string;
    createAnyway: string;
  };
  result: {
    created: (name: string, space: string) => string;
    createdBody: string;
    replayed: string;
    write: string;
    toGarden: string;
    failed: string;
    uncertain: string;
    retry: string;
    conflict: string;
    signedOut: string;
    signIn: string;
    spaceUnavailable: string;
    identityUnavailable: string;
  };
}

const uk: ObjectSetupCopy = {
  title: "Нова рослина чи тварина",
  intro:
    "Додайте конкретну рослину чи тварину, про яку писатимете: кущ томата в теплиці, вулик, кота.",
  back: "До мого саду",
  stepOf: (step, total) => `Крок ${step} з ${total}`,
  change: "Змінити",
  next: "Далі",
  previous: "Назад",
  kind: {
    question: "Кого ви додаєте?",
    plant: "Рослину",
    plantDescription: "Дерево, кущ, грядку, кімнатну рослину.",
    animal: "Тварину",
    animalDescription: "Курей, бджолину сім'ю, кота, козу.",
    summary: { plant: "Рослина", animal: "Тварина" },
  },
  name: {
    question: {
      plant: "Як називається ця рослина?",
      animal: "Як називається ця тварина?",
    },
    label: "Назва",
    hint: {
      plant:
        "Так, як ви її називаєте. Можна обрати вид чи сорт із каталогу або залишити свою назву.",
      animal:
        "Так, як ви її називаєте. Можна обрати вид чи породу з каталогу або залишити свою назву.",
    },
    placeholder: { plant: "Томат Черокі", animal: "Кури на подвір'ї" },
    required: "Введіть назву.",
    tooLong: "Назва має бути не довшою за 120 символів.",
    keepWithoutMatch: "Залишити без відповідності",
    noMatch: "Без відповідності в каталозі — її можна додати пізніше.",
    organism: (name) => `Вид у каталозі: ${name}`,
    ownLabel: (name) => `Ваша назва: ${name}`,
    sharedOrganismNote:
      "Каталог описує вид загалом, а не вашу рослину чи тварину.",
  },
  space: {
    question: "У якому просторі?",
    hint: "Будь-який із ваших просторів — або новий.",
    required: "Оберіть простір.",
    create: "Створити новий простір",
    sheetTitle: "Новий простір",
    close: "Закрити",
    created: (name) => `Простір «${name}» створено й вибрано.`,
  },
  review: {
    question: "Перевірте й додайте",
    willCreate: {
      plant: "Буде додано рослину",
      animal: "Буде додано тварину",
    },
    identity: "Вид у каталозі",
    notIdentified: "Ще не визначено",
    space: "Простір",
    publishesNothing:
      "Додавання нічого не публікує. Перший запис про неї ви опублікуєте окремо.",
    create: "Додати",
    creating: "Додаємо…",
  },
  matches: {
    title: (name) => `У вас уже є «${name}»`,
    body: "Можна написати про наявну — або додати ще одну.",
    write: "Написати",
    inSpace: (space) => `у просторі «${space}»`,
    addAnother: "Додати ще одну",
  },
  duplicate: {
    title: (name, space) => `У просторі «${space}» уже є «${name}»`,
    body: "Можна відкрити наявну або додати ще одну з такою самою назвою.",
    openExisting: "Відкрити наявну",
    createAnyway: "Додати ще одну",
  },
  result: {
    created: (name, space) => `«${name}» додано в простір «${space}»`,
    createdBody:
      "Записів про неї ще немає. Нічого не опубліковано, доки ви не опублікуєте запис.",
    replayed: "Цей запит уже додав її раніше — другої не з'явилося.",
    write: "Написати перший запис",
    toGarden: "До мого саду",
    failed: "Не вдалося додати. Ваші відповіді збережено на цій сторінці.",
    uncertain:
      "Не вдалося дізнатися, чи додано. Повторіть — той самий запит не створить другу.",
    retry: "Повторити",
    conflict: "Цей запит уже використано. Оновіть сторінку й спробуйте ще раз.",
    signedOut:
      "Сесія завершилася. Увійдіть знову — відповіді залишаться на сторінці до перезавантаження.",
    signIn: "Увійти",
    spaceUnavailable: "Цей простір більше недоступний. Оберіть інший.",
    identityUnavailable:
      "Цей вид зараз не можна прив'язати. Оберіть інший або залиште свою назву.",
  },
};

const bg: ObjectSetupCopy = {
  title: "Ново растение или животно",
  intro:
    "Добавете конкретното растение или животно, за което ще пишете: храст домати в оранжерията, кошер, котка.",
  back: "Към моята градина",
  stepOf: (step, total) => `Стъпка ${step} от ${total}`,
  change: "Промени",
  next: "Напред",
  previous: "Назад",
  kind: {
    question: "Какво добавяте?",
    plant: "Растение",
    plantDescription: "Дърво, храст, леха, стайно растение.",
    animal: "Животно",
    animalDescription: "Кокошки, пчелно семейство, котка, коза.",
    summary: { plant: "Растение", animal: "Животно" },
  },
  name: {
    question: {
      plant: "Как се казва това растение?",
      animal: "Как се казва това животно?",
    },
    label: "Име",
    hint: {
      plant:
        "Така, както вие го наричате. Можете да изберете вид или сорт от каталога или да запазите свое име.",
      animal:
        "Така, както вие го наричате. Можете да изберете вид или порода от каталога или да запазите свое име.",
    },
    placeholder: { plant: "Домат Чероки", animal: "Кокошки в двора" },
    required: "Въведете име.",
    tooLong: "Името трябва да е до 120 знака.",
    keepWithoutMatch: "Запази без съответствие",
    noMatch: "Без съответствие в каталога — може да се добави по-късно.",
    organism: (name) => `Вид в каталога: ${name}`,
    ownLabel: (name) => `Вашето име: ${name}`,
    sharedOrganismNote:
      "Каталогът описва вида изобщо, а не вашето растение или животно.",
  },
  space: {
    question: "В кое пространство?",
    hint: "Което и да е от вашите пространства — или ново.",
    required: "Изберете пространство.",
    create: "Създай ново пространство",
    sheetTitle: "Ново пространство",
    close: "Затвори",
    created: (name) => `Пространството „${name}“ е създадено и избрано.`,
  },
  review: {
    question: "Проверете и добавете",
    willCreate: {
      plant: "Ще бъде добавено растение",
      animal: "Ще бъде добавено животно",
    },
    identity: "Вид в каталога",
    notIdentified: "Още не е определен",
    space: "Пространство",
    publishesNothing:
      "Добавянето не публикува нищо. Първия запис за него ще публикувате отделно.",
    create: "Добави",
    creating: "Добавяме…",
  },
  matches: {
    title: (name) => `Вече имате „${name}“`,
    body: "Можете да пишете за него — или да добавите още едно.",
    write: "Пиши",
    inSpace: (space) => `в пространството „${space}“`,
    addAnother: "Добави още едно",
  },
  duplicate: {
    title: (name, space) => `В пространството „${space}“ вече има „${name}“`,
    body: "Можете да отворите съществуващото или да добавите още едно със същото име.",
    openExisting: "Отвори съществуващото",
    createAnyway: "Добави още едно",
  },
  result: {
    created: (name, space) =>
      `„${name}“ е добавено в пространството „${space}“`,
    createdBody:
      "Още няма записи за него. Нищо не е публикувано, докато не публикувате запис.",
    replayed: "Тази заявка вече го е добавила — второ не се появи.",
    write: "Напиши първия запис",
    toGarden: "Към моята градина",
    failed:
      "Не успяхме да добавим. Отговорите ви са запазени на тази страница.",
    uncertain:
      "Не успяхме да разберем дали е добавено. Опитайте отново — същата заявка няма да създаде второ.",
    retry: "Опитай отново",
    conflict:
      "Тази заявка вече е използвана. Презаредете страницата и опитайте отново.",
    signedOut:
      "Сесията изтече. Влезте отново — отговорите остават на страницата до презареждане.",
    signIn: "Вход",
    spaceUnavailable: "Това пространство вече не е достъпно. Изберете друго.",
    identityUnavailable:
      "Този вид не може да се свърже сега. Изберете друг или запазете свое име.",
  },
};

const ru: ObjectSetupCopy = {
  title: "Новое растение или животное",
  intro:
    "Добавьте конкретное растение или животное, о котором будете писать: куст томата в теплице, улей, кота.",
  back: "К моему саду",
  stepOf: (step, total) => `Шаг ${step} из ${total}`,
  change: "Изменить",
  next: "Далее",
  previous: "Назад",
  kind: {
    question: "Кого вы добавляете?",
    plant: "Растение",
    plantDescription: "Дерево, куст, грядку, комнатное растение.",
    animal: "Животное",
    animalDescription: "Кур, пчелиную семью, кота, козу.",
    summary: { plant: "Растение", animal: "Животное" },
  },
  name: {
    question: {
      plant: "Как называется это растение?",
      animal: "Как называется это животное?",
    },
    label: "Название",
    hint: {
      plant:
        "Так, как вы его называете. Можно выбрать вид или сорт из каталога или оставить своё название.",
      animal:
        "Так, как вы его называете. Можно выбрать вид или породу из каталога или оставить своё название.",
    },
    placeholder: { plant: "Томат Чероки", animal: "Куры во дворе" },
    required: "Введите название.",
    tooLong: "Название должно быть не длиннее 120 символов.",
    keepWithoutMatch: "Оставить без соответствия",
    noMatch: "Без соответствия в каталоге — его можно добавить позже.",
    organism: (name) => `Вид в каталоге: ${name}`,
    ownLabel: (name) => `Ваше название: ${name}`,
    sharedOrganismNote:
      "Каталог описывает вид в целом, а не ваше растение или животное.",
  },
  space: {
    question: "В каком пространстве?",
    hint: "Любое из ваших пространств — или новое.",
    required: "Выберите пространство.",
    create: "Создать новое пространство",
    sheetTitle: "Новое пространство",
    close: "Закрыть",
    created: (name) => `Пространство «${name}» создано и выбрано.`,
  },
  review: {
    question: "Проверьте и добавьте",
    willCreate: {
      plant: "Будет добавлено растение",
      animal: "Будет добавлено животное",
    },
    identity: "Вид в каталоге",
    notIdentified: "Ещё не определён",
    space: "Пространство",
    publishesNothing:
      "Добавление ничего не публикует. Первую запись о нём вы опубликуете отдельно.",
    create: "Добавить",
    creating: "Добавляем…",
  },
  matches: {
    title: (name) => `У вас уже есть «${name}»`,
    body: "Можно написать о нём — или добавить ещё одно.",
    write: "Написать",
    inSpace: (space) => `в пространстве «${space}»`,
    addAnother: "Добавить ещё одно",
  },
  duplicate: {
    title: (name, space) => `В пространстве «${space}» уже есть «${name}»`,
    body: "Можно открыть существующее или добавить ещё одно с таким же названием.",
    openExisting: "Открыть существующее",
    createAnyway: "Добавить ещё одно",
  },
  result: {
    created: (name, space) => `«${name}» добавлено в пространство «${space}»`,
    createdBody:
      "Записей о нём ещё нет. Ничего не опубликовано, пока вы не опубликуете запись.",
    replayed: "Этот запрос уже добавил его раньше — второго не появилось.",
    write: "Написать первую запись",
    toGarden: "К моему саду",
    failed: "Не удалось добавить. Ваши ответы сохранены на этой странице.",
    uncertain:
      "Не удалось узнать, добавлено ли. Повторите — тот же запрос не создаст второе.",
    retry: "Повторить",
    conflict:
      "Этот запрос уже использован. Обновите страницу и попробуйте снова.",
    signedOut:
      "Сессия завершилась. Войдите снова — ответы на странице останутся до перезагрузки.",
    signIn: "Войти",
    spaceUnavailable: "Это пространство больше недоступно. Выберите другое.",
    identityUnavailable:
      "Этот вид сейчас нельзя привязать. Выберите другой или оставьте своё название.",
  },
};

const COPY: Record<InterfaceLocale, ObjectSetupCopy> = { uk, bg, ru };

export function getObjectSetupCopy(locale: InterfaceLocale): ObjectSetupCopy {
  return COPY[locale];
}
