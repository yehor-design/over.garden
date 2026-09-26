import type { InterfaceLocale } from "@/lib/interface-localization";
import type { SpaceSetupFieldError } from "@/lib/garden/space-setup";

/** The words of a space's own page and its settings (`OVE-490`). */
export interface SpacePageCopy {
  shell: {
    eyebrow: string;
    title: string;
    back: string;
    settingsTitle: string;
    settingsBack: string;
  };
  overview: {
    objects: string;
    entries: string;
    lastEntry: string;
    never: string;
    locationHidden: string;
    locationRegion: string;
    /** The cover's `alt`: «Фото простору «{name}»». */
    photoAlt: string;
  };
  actions: {
    label: string;
    write: string;
    writeLabel: string;
    addObject: string;
    settings: string;
  };
  views: { label: string; overview: string; objects: string; history: string };
  objects: {
    title: string;
    all: string;
    empty: string;
    error: string;
  };
  history: {
    title: string;
    description: string;
    all: string;
    empty: string;
    error: string;
    aboutSpace: string;
    aboutObject: string;
    notPublic: string;
    edit: string;
    editLabel: string;
  };
  settings: {
    description: string;
    detailsTitle: string;
    photoTitle: string;
    photoSaving: string;
    photoSaved: string;
    photoRemoved: string;
    photoFailed: string;
    name: string;
    nameHelp: string;
    location: string;
    hidden: string;
    region: string;
    hiddenHelp: string;
    regionHelp: string;
    chooseRegion: string;
    coarseRegion: string;
    save: string;
    saving: string;
    saved: string;
    failed: string;
    missing: string;
    errors: Record<SpaceSetupFieldError, string>;
    deleteTitle: string;
    deleteEmpty: string;
    deleteBlocked: string;
    deleteButton: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    deleteConfirm: string;
    deleteCancel: string;
    deleting: string;
    deleted: string;
    deleteFailed: string;
  };
}

const uk: SpacePageCopy = {
  shell: {
    eyebrow: "Мій сад",
    title: "Простір",
    back: "До мого саду",
    settingsTitle: "Налаштування простору",
    settingsBack: "До простору",
  },
  overview: {
    objects: "Рослин і тварин: {count}",
    entries: "Записів: {count}",
    lastEntry: "Останній запис: {when}",
    never: "Ще без записів",
    locationHidden: "Місце не показується",
    locationRegion: "Регіон: {region}",
    photoAlt: "Фото простору «{name}»",
  },
  actions: {
    label: "Дії з простором",
    write: "Записати",
    writeLabel: "Записати в «{name}»",
    addObject: "Додати рослину чи тварину",
    settings: "Налаштування",
  },
  views: {
    label: "Розділи простору",
    overview: "Огляд",
    objects: "Рослини й тварини",
    history: "Історія",
  },
  objects: {
    title: "Рослини й тварини",
    all: "Усі ({count})",
    empty: "У цьому просторі ще немає рослин і тварин.",
    error: "Не вдалося показати рослини й тварин",
  },
  history: {
    title: "Історія",
    description:
      "Записи про сам простір і про все, що в ньому, — кожен один раз.",
    all: "Уся історія ({count})",
    empty: "Тут ще нічого не записано.",
    error: "Не вдалося показати історію",
    aboutSpace: "Про простір",
    aboutObject: "Про «{name}»",
    notPublic: "Без публічної адреси",
    edit: "Редагувати",
    editLabel: "Редагувати «{title}»",
  },
  settings: {
    description:
      "Назва і те, чи показувати регіон простору. Рослини, тварини й записи лишаються на місці.",
    detailsTitle: "Назва і місце",
    photoTitle: "Фото",
    photoSaving: "Зберігаємо фото…",
    photoSaved: "Фото збережено.",
    photoRemoved: "Фото прибрано.",
    photoFailed: "Не вдалося зберегти фото. Спробуйте ще раз.",
    name: "Назва",
    nameHelp:
      "Нова назва з'явиться всюди, де показано цей простір, — зокрема на публічних сторінках його рослин і тварин.",
    location: "Місце",
    hidden: "Не показувати",
    region: "Показувати регіон",
    hiddenHelp: "На публічних сторінках місце не згадується.",
    regionHelp: "Публічно видно лише область, ніколи не адресу.",
    chooseRegion: "Оберіть регіон",
    coarseRegion: "Регіон",
    save: "Зберегти",
    saving: "Зберігаємо…",
    saved: "Збережено.",
    failed: "Не вдалося зберегти. Спробуйте ще раз — введене лишилося.",
    missing: "Цього простору немає у вашому саду.",
    errors: {
      name_required: "Вкажіть назву простору.",
      name_too_long: "Назва задовга: до 120 символів.",
      region_required: "Оберіть регіон або не показуйте місце.",
      region_invalid: "Такого регіону немає в списку.",
    },
    deleteTitle: "Видалення простору",
    deleteEmpty:
      "Простір порожній: у ньому немає рослин, тварин і записів. Його можна видалити, але не можна відновити.",
    deleteBlocked:
      "Простір видаляється лише порожнім, і нічого з нього не зникне разом із ним. Зараз тут рослин і тварин — {objects}, записів — {entries} (разом із тими, що чекають остаточного видалення).",
    deleteButton: "Видалити простір…",
    deleteConfirmTitle: "Видалити «{name}»?",
    deleteConfirmBody: "Простір зникне з вашого саду. Це не можна скасувати.",
    deleteConfirm: "Видалити",
    deleteCancel: "Скасувати",
    deleting: "Видаляємо…",
    deleted: "Простір «{name}» видалено.",
    deleteFailed:
      "Простір не видалено: у ньому з'явилися рослини, тварини чи записи. Оновіть сторінку.",
  },
};

const bg: SpacePageCopy = {
  shell: {
    eyebrow: "Моята градина",
    title: "Пространство",
    back: "Към моята градина",
    settingsTitle: "Настройки на пространството",
    settingsBack: "Към пространството",
  },
  overview: {
    objects: "Растения и животни: {count}",
    entries: "Записи: {count}",
    lastEntry: "Последен запис: {when}",
    never: "Все още без записи",
    locationHidden: "Мястото не се показва",
    locationRegion: "Регион: {region}",
    photoAlt: "Снимка на пространството „{name}“",
  },
  actions: {
    label: "Действия с пространството",
    write: "Запиши",
    writeLabel: "Запиши в „{name}“",
    addObject: "Добави растение или животно",
    settings: "Настройки",
  },
  views: {
    label: "Раздели на пространството",
    overview: "Преглед",
    objects: "Растения и животни",
    history: "История",
  },
  objects: {
    title: "Растения и животни",
    all: "Всички ({count})",
    empty: "В това пространство още няма растения и животни.",
    error: "Растенията и животните не могат да се покажат",
  },
  history: {
    title: "История",
    description:
      "Записи за самото пространство и за всичко в него — всеки по веднъж.",
    all: "Цялата история ({count})",
    empty: "Тук още нищо не е записано.",
    error: "Историята не може да се покаже",
    aboutSpace: "За пространството",
    aboutObject: "За „{name}“",
    notPublic: "Без публичен адрес",
    edit: "Редактирай",
    editLabel: "Редактирай „{title}“",
  },
  settings: {
    description:
      "Името и дали регионът на пространството се показва. Растенията, животните и записите остават на мястото си.",
    detailsTitle: "Име и място",
    photoTitle: "Снимка",
    photoSaving: "Запазваме снимката…",
    photoSaved: "Снимката е запазена.",
    photoRemoved: "Снимката е премахната.",
    photoFailed: "Снимката не беше запазена. Опитайте отново.",
    name: "Име",
    nameHelp:
      "Новото име ще се появи навсякъде, където е показано пространството — включително на публичните страници на растенията и животните му.",
    location: "Място",
    hidden: "Не показвай",
    region: "Показвай региона",
    hiddenHelp: "Публичните страници не споменават мястото.",
    regionHelp: "Публично се вижда само областта, никога адрес.",
    chooseRegion: "Изберете регион",
    coarseRegion: "Регион",
    save: "Запази",
    saving: "Запазване…",
    saved: "Запазено.",
    failed: "Не можа да се запази. Опитайте отново — въведеното остава.",
    missing: "Това пространство не е във вашата градина.",
    errors: {
      name_required: "Въведете име на пространството.",
      name_too_long: "Името е твърде дълго: до 120 знака.",
      region_required: "Изберете регион или не показвайте мястото.",
      region_invalid: "Такъв регион няма в списъка.",
    },
    deleteTitle: "Изтриване на пространството",
    deleteEmpty:
      "Пространството е празно: в него няма растения, животни и записи. Може да се изтрие, но не и да се възстанови.",
    deleteBlocked:
      "Пространството се изтрива само празно и нищо в него не изчезва заедно с него. Сега тук има растения и животни — {objects}, записи — {entries} (включително чакащите окончателно изтриване).",
    deleteButton: "Изтрий пространството…",
    deleteConfirmTitle: "Да се изтрие ли „{name}“?",
    deleteConfirmBody:
      "Пространството ще изчезне от градината ви. Това не може да се отмени.",
    deleteConfirm: "Изтрий",
    deleteCancel: "Отказ",
    deleting: "Изтриване…",
    deleted: "Пространството „{name}“ е изтрито.",
    deleteFailed:
      "Пространството не е изтрито: в него се появиха растения, животни или записи. Обновете страницата.",
  },
};

const ru: SpacePageCopy = {
  shell: {
    eyebrow: "Мой сад",
    title: "Пространство",
    back: "К моему саду",
    settingsTitle: "Настройки пространства",
    settingsBack: "К пространству",
  },
  overview: {
    objects: "Растений и животных: {count}",
    entries: "Записей: {count}",
    lastEntry: "Последняя запись: {when}",
    never: "Ещё без записей",
    locationHidden: "Место не показывается",
    locationRegion: "Регион: {region}",
    photoAlt: "Фото пространства «{name}»",
  },
  actions: {
    label: "Действия с пространством",
    write: "Записать",
    writeLabel: "Записать в «{name}»",
    addObject: "Добавить растение или животное",
    settings: "Настройки",
  },
  views: {
    label: "Разделы пространства",
    overview: "Обзор",
    objects: "Растения и животные",
    history: "История",
  },
  objects: {
    title: "Растения и животные",
    all: "Все ({count})",
    empty: "В этом пространстве ещё нет растений и животных.",
    error: "Не удалось показать растения и животных",
  },
  history: {
    title: "История",
    description:
      "Записи о самом пространстве и обо всём, что в нём, — каждая один раз.",
    all: "Вся история ({count})",
    empty: "Здесь ещё ничего не записано.",
    error: "Не удалось показать историю",
    aboutSpace: "О пространстве",
    aboutObject: "О «{name}»",
    notPublic: "Без публичного адреса",
    edit: "Редактировать",
    editLabel: "Редактировать «{title}»",
  },
  settings: {
    description:
      "Название и то, показывать ли регион пространства. Растения, животные и записи остаются на месте.",
    detailsTitle: "Название и место",
    photoTitle: "Фото",
    photoSaving: "Сохраняем фото…",
    photoSaved: "Фото сохранено.",
    photoRemoved: "Фото убрано.",
    photoFailed: "Не удалось сохранить фото. Попробуйте ещё раз.",
    name: "Название",
    nameHelp:
      "Новое название появится везде, где показано это пространство, — в том числе на публичных страницах его растений и животных.",
    location: "Место",
    hidden: "Не показывать",
    region: "Показывать регион",
    hiddenHelp: "Публичные страницы не упоминают место.",
    regionHelp: "Публично видна только область, никогда не адрес.",
    chooseRegion: "Выберите регион",
    coarseRegion: "Регион",
    save: "Сохранить",
    saving: "Сохраняем…",
    saved: "Сохранено.",
    failed: "Не удалось сохранить. Попробуйте ещё раз — введённое осталось.",
    missing: "Этого пространства нет в вашем саду.",
    errors: {
      name_required: "Укажите название пространства.",
      name_too_long: "Название слишком длинное: до 120 символов.",
      region_required: "Выберите регион или не показывайте место.",
      region_invalid: "Такого региона нет в списке.",
    },
    deleteTitle: "Удаление пространства",
    deleteEmpty:
      "Пространство пустое: в нём нет растений, животных и записей. Его можно удалить, но нельзя восстановить.",
    deleteBlocked:
      "Пространство удаляется только пустым, и ничто в нём не исчезнет вместе с ним. Сейчас здесь растений и животных — {objects}, записей — {entries} (вместе с ожидающими окончательного удаления).",
    deleteButton: "Удалить пространство…",
    deleteConfirmTitle: "Удалить «{name}»?",
    deleteConfirmBody:
      "Пространство исчезнет из вашего сада. Это нельзя отменить.",
    deleteConfirm: "Удалить",
    deleteCancel: "Отмена",
    deleting: "Удаляем…",
    deleted: "Пространство «{name}» удалено.",
    deleteFailed:
      "Пространство не удалено: в нём появились растения, животные или записи. Обновите страницу.",
  },
};

const COPY: Record<InterfaceLocale, SpacePageCopy> = { uk, bg, ru };

export function getSpacePageCopy(locale: InterfaceLocale): SpacePageCopy {
  return COPY[locale];
}

export function formatSpacePageTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
