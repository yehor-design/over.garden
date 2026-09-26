import type { InterfaceLocale } from "@/lib/interface-localization";

/** The words of My garden as a collection (`OVE-489`). */
export interface GardenCollectionCopy {
  actions: {
    label: string;
    newEntry: string;
    addObject: string;
    addSpace: string;
  };
  search: {
    label: string;
    placeholder: string;
    submit: string;
    /** The chip of an applied search, "«{query}»". */
    chip: string;
    removeChip: string;
    clear: string;
    pending: string;
  };
  sort: { label: string; recent: string; name: string };
  modes: { label: string; all: string; object: string; space: string };
  /** The counts sentence: "{all} — {spaces}, {objects}". */
  summary: { all: string; found: string; spaces: string; objects: string };
  groups: {
    spaces: string;
    objects: string;
    allSpaces: string;
    spacesError: string;
    objectsError: string;
  };
  row: {
    lastEntry: string;
    never: string;
    write: string;
    /** The Write link's accessible name: "Записати: {name}". */
    writeLabel: string;
    plant: string;
    animal: string;
    space: string;
    objectsInSpace: string;
  };
  noResults: {
    title: string;
    body: string;
    clear: string;
    addObject: string;
  };
  emptyGroup: { spaces: string; objects: string };
  setup: {
    title: string;
    body: string;
    addObject: string;
    addSpace: string;
  };
  pagination: { label: string; previous: string; next: string; page: string };
}

const uk: GardenCollectionCopy = {
  actions: {
    label: "Дії в саду",
    newEntry: "Новий запис",
    addObject: "Додати рослину чи тварину",
    addSpace: "Новий простір",
  },
  search: {
    label: "Знайти у своєму саду",
    placeholder: "Назва, вид, сорт чи простір",
    submit: "Знайти",
    chip: "«{query}»",
    removeChip: "Прибрати пошук «{query}»",
    clear: "Очистити все",
    pending: "Оновлюємо список…",
  },
  sort: {
    label: "Порядок",
    recent: "Спершу нещодавні записи",
    name: "За назвою",
  },
  modes: {
    label: "Що показати",
    all: "Усе",
    object: "Рослини й тварини",
    space: "Простори",
  },
  summary: {
    all: "У саду",
    found: "Знайдено",
    spaces: "простори: {count}",
    objects: "рослини й тварини: {count}",
  },
  groups: {
    spaces: "Простори",
    objects: "Рослини й тварини",
    allSpaces: "Усі простори ({count})",
    spacesError: "Не вдалося показати простори",
    objectsError: "Не вдалося показати рослини й тварин",
  },
  row: {
    lastEntry: "Останній запис: {when}",
    never: "Ще без записів",
    write: "Записати",
    writeLabel: "Записати: {name}",
    plant: "Рослина",
    animal: "Тварина",
    space: "Простір",
    objectsInSpace: "Рослин і тварин: {count}",
  },
  noResults: {
    title: "Нічого не знайдено",
    body: "Спробуйте іншу назву, вид, сорт чи простір.",
    clear: "Очистити пошук",
    addObject: "Додати рослину чи тварину",
  },
  emptyGroup: {
    spaces: "Просторів ще немає.",
    objects: "Рослин і тварин ще немає.",
  },
  setup: {
    title: "Почніть свій сад",
    body: "Сад складається з просторів — балкона, теплиці, ділянки — і рослин чи тварин у них.",
    addObject: "Додати рослину чи тварину",
    addSpace: "Створити простір",
  },
  pagination: {
    label: "Сторінки саду",
    previous: "Попередні",
    next: "Наступні",
    page: "Сторінка {page} з {pages}",
  },
};

const bg: GardenCollectionCopy = {
  actions: {
    label: "Действия в градината",
    newEntry: "Нов запис",
    addObject: "Добави растение или животно",
    addSpace: "Ново пространство",
  },
  search: {
    label: "Търсене в градината ви",
    placeholder: "Име, вид, сорт или пространство",
    submit: "Търси",
    chip: "„{query}“",
    removeChip: "Премахни търсенето „{query}“",
    clear: "Изчисти всичко",
    pending: "Списъкът се обновява…",
  },
  sort: {
    label: "Подредба",
    recent: "Първо последните записи",
    name: "По име",
  },
  modes: {
    label: "Какво да се показва",
    all: "Всичко",
    object: "Растения и животни",
    space: "Пространства",
  },
  summary: {
    all: "В градината",
    found: "Намерени",
    spaces: "пространства: {count}",
    objects: "растения и животни: {count}",
  },
  groups: {
    spaces: "Пространства",
    objects: "Растения и животни",
    allSpaces: "Всички пространства ({count})",
    spacesError: "Пространствата не могат да се покажат",
    objectsError: "Растенията и животните не могат да се покажат",
  },
  row: {
    lastEntry: "Последен запис: {when}",
    never: "Все още без записи",
    write: "Запиши",
    writeLabel: "Запиши: {name}",
    plant: "Растение",
    animal: "Животно",
    space: "Пространство",
    objectsInSpace: "Растения и животни: {count}",
  },
  noResults: {
    title: "Нищо не е намерено",
    body: "Опитайте друго име, вид, сорт или пространство.",
    clear: "Изчисти търсенето",
    addObject: "Добави растение или животно",
  },
  emptyGroup: {
    spaces: "Все още няма пространства.",
    objects: "Все още няма растения и животни.",
  },
  setup: {
    title: "Започнете градината си",
    body: "Градината се състои от пространства — балкон, оранжерия, парцел — и растения или животни в тях.",
    addObject: "Добави растение или животно",
    addSpace: "Създай пространство",
  },
  pagination: {
    label: "Страници на градината",
    previous: "Предишни",
    next: "Следващи",
    page: "Страница {page} от {pages}",
  },
};

const ru: GardenCollectionCopy = {
  actions: {
    label: "Действия в саду",
    newEntry: "Новая запись",
    addObject: "Добавить растение или животное",
    addSpace: "Новое пространство",
  },
  search: {
    label: "Найти в своём саду",
    placeholder: "Название, вид, сорт или пространство",
    submit: "Найти",
    chip: "«{query}»",
    removeChip: "Убрать поиск «{query}»",
    clear: "Очистить всё",
    pending: "Обновляем список…",
  },
  sort: {
    label: "Порядок",
    recent: "Сначала недавние записи",
    name: "По названию",
  },
  modes: {
    label: "Что показать",
    all: "Всё",
    object: "Растения и животные",
    space: "Пространства",
  },
  summary: {
    all: "В саду",
    found: "Найдено",
    spaces: "пространства: {count}",
    objects: "растения и животные: {count}",
  },
  groups: {
    spaces: "Пространства",
    objects: "Растения и животные",
    allSpaces: "Все пространства ({count})",
    spacesError: "Не удалось показать пространства",
    objectsError: "Не удалось показать растения и животных",
  },
  row: {
    lastEntry: "Последняя запись: {when}",
    never: "Ещё без записей",
    write: "Записать",
    writeLabel: "Записать: {name}",
    plant: "Растение",
    animal: "Животное",
    space: "Пространство",
    objectsInSpace: "Растений и животных: {count}",
  },
  noResults: {
    title: "Ничего не найдено",
    body: "Попробуйте другое название, вид, сорт или пространство.",
    clear: "Очистить поиск",
    addObject: "Добавить растение или животное",
  },
  emptyGroup: {
    spaces: "Пространств пока нет.",
    objects: "Растений и животных пока нет.",
  },
  setup: {
    title: "Начните свой сад",
    body: "Сад состоит из пространств — балкона, теплицы, участка — и растений или животных в них.",
    addObject: "Добавить растение или животное",
    addSpace: "Создать пространство",
  },
  pagination: {
    label: "Страницы сада",
    previous: "Предыдущие",
    next: "Следующие",
    page: "Страница {page} из {pages}",
  },
};

const COPY: Record<InterfaceLocale, GardenCollectionCopy> = { uk, bg, ru };

export function getGardenCollectionCopy(
  locale: InterfaceLocale,
): GardenCollectionCopy {
  return COPY[locale];
}

export function formatGardenCollectionTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
