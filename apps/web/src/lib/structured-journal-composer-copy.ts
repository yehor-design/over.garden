import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";
import type { PublicLocale } from "@/lib/public-localization";

const LABELS: Record<PublicLocale, StructuredJournalComposerLabels> = {
  uk: {
    loading: "Завантаження редактора…",
    failureTitle: "Редактор тимчасово недоступний",
    failureBody:
      "Чернетку збережено. Оновіть сторінку, щоб продовжити без втрати тексту й фото.",
    retry: "Спробувати знову",
    silentLoss: "Збереження зупинено: частина блоку зникла під час серіалізації.",
    imageChoose: "Додати фото",
    imageUploading: "Обробка фото…",
    imageRemove: "Прибрати фото",
    imageRejectRemote:
      "Можна лише файл з пристрою. Посилання й віддалені зображення відхилено.",
    unavailableTitle: "Вміст недоступний",
    unavailableBody: "Цей запис не вдалося безпечно показати.",
    titleLabel: "Заголовок",
    dateLabel: "Дата",
    saveLabel: "Зберегти",
    tools: {
      paragraph: "Текст",
      header: "Заголовок",
      list: "Список",
      quote: "Цитата",
      delimiter: "Роздільник",
      image: "Фото",
      bold: "Жирний",
      italic: "Курсив",
      link: "Посилання",
    },
  },
  bg: {
    loading: "Зареждане на редактора…",
    failureTitle: "Редакторът временно не е наличен",
    failureBody:
      "Черновата е запазена. Обновете страницата, за да продължите без загуба на текст и снимки.",
    retry: "Опитай отново",
    silentLoss: "Записът е спрян: част от блок изчезна при сериализация.",
    imageChoose: "Добави снимка",
    imageUploading: "Обработка на снимка…",
    imageRemove: "Премахни снимка",
    imageRejectRemote:
      "Само файл от устройството. Връзки и отдалечени изображения са отхвърлени.",
    unavailableTitle: "Съдържанието е недостъпно",
    unavailableBody: "Този запис не може да бъде показан безопасно.",
    titleLabel: "Заглавие",
    dateLabel: "Дата",
    saveLabel: "Запази",
    tools: {
      paragraph: "Текст",
      header: "Заглавие",
      list: "Списък",
      quote: "Цитат",
      delimiter: "Разделител",
      image: "Снимка",
      bold: "Удебелен",
      italic: "Курсив",
      link: "Връзка",
    },
  },
  ru: {
    loading: "Загрузка редактора…",
    failureTitle: "Редактор временно недоступен",
    failureBody:
      "Черновик сохранён. Обновите страницу, чтобы продолжить без потери текста и фото.",
    retry: "Попробовать снова",
    silentLoss: "Сохранение остановлено: часть блока исчезла при сериализации.",
    imageChoose: "Добавить фото",
    imageUploading: "Обработка фото…",
    imageRemove: "Убрать фото",
    imageRejectRemote:
      "Только файл с устройства. Ссылки и удалённые изображения отклонены.",
    unavailableTitle: "Содержимое недоступно",
    unavailableBody: "Эту запись нельзя безопасно показать.",
    titleLabel: "Заголовок",
    dateLabel: "Дата",
    saveLabel: "Сохранить",
    tools: {
      paragraph: "Текст",
      header: "Заголовок",
      list: "Список",
      quote: "Цитата",
      delimiter: "Разделитель",
      image: "Фото",
      bold: "Жирный",
      italic: "Курсив",
      link: "Ссылка",
    },
  },
};

export function getStructuredJournalComposerLabels(
  locale: PublicLocale,
): StructuredJournalComposerLabels {
  return LABELS[locale];
}
