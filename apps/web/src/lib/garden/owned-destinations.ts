import type { InterfaceLocale } from "@/lib/interface-localization";

interface DestinationBase {
  id: string;
  displayName: string;
}
export type OwnedDestination =
  | (DestinationBase & { kind: "space" })
  | (DestinationBase & {
      kind: "object";
      objectKind: "plant" | "animal";
      parent: { id: string; displayName: string } | null;
      species: string | null;
    });
export interface OwnedDestinationPage {
  items: OwnedDestination[];
  recent: OwnedDestination[];
  nextCursor: string | null;
}
export type DestinationFilter = "all" | "space" | "object";
export const DESTINATION_PAGE_SIZE = 20;
export const DESTINATION_QUERY_LIMIT = 120;
export const destinationKey = (value: OwnedDestination) =>
  `${value.kind}:${value.id}`;
export function destinationJournalPath(value: OwnedDestination): string {
  return value.kind === "space"
    ? `/garden?space=${encodeURIComponent(value.id)}#space-journal`
    : `/garden/objects/${encodeURIComponent(value.id)}#follow-up-composer`;
}
export const DESTINATION_COPY = {
  uk: {
    unavailable:
      "Обране місце вже недоступне. Виберіть інший простір; текст залишився на екрані.",
    label: "Куди записати?",
    placeholder: "Знайти свій простір або об’єкт",
    space: "Простір",
    plant: "Рослина",
    animal: "Тварина",
    unassigned: "Без простору",
    recent: "Нещодавні публікації",
    browse: "Усі місця для запису",
    loading: "Шукаємо…",
    empty: "Нічого не знайдено. Спробуйте іншу назву.",
    error: "Не вдалося завантажити список. Вибір і текст збережено на екрані.",
    retry: "Спробувати знову",
    more: "Наступні результати",
    selected: "Обрано",
    clear: "Очистити пошук",
    change: "Змінити вибір",
    open: "Відкрити журнал",
    spaces: "Знайти свій простір",
  },
  bg: {
    unavailable:
      "Избраното място вече не е достъпно. Изберете друго пространство; текстът остава на екрана.",
    label: "Къде да запишете?",
    placeholder: "Намерете свое пространство или обект",
    space: "Пространство",
    plant: "Растение",
    animal: "Животно",
    unassigned: "Без пространство",
    recent: "Скорошни публикации",
    browse: "Всички места за запис",
    loading: "Търсим…",
    empty: "Няма резултати. Опитайте друго име.",
    error: "Списъкът не се зареди. Изборът и текстът остават на екрана.",
    retry: "Опитайте отново",
    more: "Следващи резултати",
    selected: "Избрано",
    clear: "Изчистете търсенето",
    change: "Променете избора",
    open: "Отворете дневника",
    spaces: "Намерете свое пространство",
  },
  ru: {
    unavailable:
      "Выбранное место больше недоступно. Выберите другое пространство; текст остался на экране.",
    label: "Куда записать?",
    placeholder: "Найти своё пространство или объект",
    space: "Пространство",
    plant: "Растение",
    animal: "Животное",
    unassigned: "Без пространства",
    recent: "Недавние публикации",
    browse: "Все места для записи",
    loading: "Ищем…",
    empty: "Ничего не найдено. Попробуйте другое название.",
    error: "Не удалось загрузить список. Выбор и текст остались на экране.",
    retry: "Попробовать снова",
    more: "Следующие результаты",
    selected: "Выбрано",
    clear: "Очистить поиск",
    change: "Изменить выбор",
    open: "Открыть журнал",
    spaces: "Найти своё пространство",
  },
} satisfies Record<InterfaceLocale, Record<string, string>>;
export function destinationDetail(
  value: OwnedDestination,
  locale: InterfaceLocale,
) {
  const copy = DESTINATION_COPY[locale];
  return value.kind === "space"
    ? copy.space
    : [
        copy[value.objectKind],
        value.parent?.displayName ?? copy.unassigned,
        value.species,
      ]
        .filter(Boolean)
        .join(" · ");
}
