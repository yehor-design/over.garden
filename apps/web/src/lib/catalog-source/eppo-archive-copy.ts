import type { PublicLocale } from "@/lib/public-localization";
import type {
  EppoArchiveEvidenceState,
  EppoArchiveKind,
} from "@/server/catalog-source/public-eppo-explorer-repository";

export interface EppoArchiveCopy {
  title: string;
  intro: string;
  resultsTitle: string;
  detailTitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  reset: string;
  kindLabel: string;
  kinds: Record<EppoArchiveKind, string>;
  invalidQuery: string;
  empty: string;
  resultsCount: string;
  unavailable: string;
  retry: string;
  browseArchive: string;
  next: string;
  sourceCredit: string;
  sourceLicense: string;
  sourceAttribution: string;
  observed: string;
  aliases: string;
  scientificName: string;
  taxonomicRank: string;
  parentTaxon: string;
  badges: Record<EppoArchiveEvidenceState, string>;
  evidenceDescription: Record<EppoArchiveEvidenceState, string>;
  notFound: string;
}

const COPY: Record<PublicLocale, EppoArchiveCopy> = {
  uk: {
    title: "Архів джерел EPPO",
    intro:
      "Спостережені публічні дані EPPO Codes. Запис у цьому архіві не є схваленим ідентифікатором продуктового каталогу OverGarden.",
    resultsTitle: "Записи джерела",
    detailTitle: "Запис джерела EPPO",
    searchLabel: "Пошук за назвою або кодом",
    searchPlaceholder: "Введіть щонайменше 2 символи",
    searchButton: "Шукати",
    reset: "Скинути пошук",
    kindLabel: "Тип",
    kinds: {
      all: "Усі",
      plant: "Рослини",
      animal: "Тварини",
    },
    invalidQuery:
      "Використайте від 2 до 120 звичайних символів без службових знаків.",
    empty: "За цим запитом безпечних публічних записів немає.",
    resultsCount: "Знайдено записів: {count}",
    unavailable:
      "Пошук тимчасово недоступний. Дані не були замінені припущенням.",
    retry: "Спробувати ще раз",
    browseArchive: "Переглянути архів EPPO",
    next: "Наступні записи",
    sourceCredit: "Джерело",
    sourceLicense: "Ліцензія",
    sourceAttribution: "Атрибуція",
    observed: "Спостережено",
    aliases: "Інші безпечні назви",
    scientificName: "Наукова назва",
    taxonomicRank: "Таксономічний ранг",
    parentTaxon: "Батьківський таксон",
    badges: {
      source_record_not_approved: "Запис джерела — не схвалено",
      superseded_source_evidence: "Застаріле джерельне свідчення",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Це публічне свідчення джерела; воно ще не є продуктовою ідентичністю OverGarden.",
      superseded_source_evidence:
        "Джерело позначає це свідчення як неактивне або замінене; воно не є продуктовою ідентичністю OverGarden.",
    },
    notFound: "Безпечний публічний запис не знайдено.",
  },
  bg: {
    title: "Архив на източниците EPPO",
    intro:
      "Наблюдавани публични данни от EPPO Codes. Записът тук не е одобрена продуктова идентичност в каталога на OverGarden.",
    resultsTitle: "Записи от източника",
    detailTitle: "Запис от източника EPPO",
    searchLabel: "Търсене по име или код",
    searchPlaceholder: "Въведете поне 2 знака",
    searchButton: "Търсене",
    reset: "Изчистване на търсенето",
    kindLabel: "Тип",
    kinds: {
      all: "Всички",
      plant: "Растения",
      animal: "Животни",
    },
    invalidQuery:
      "Използвайте от 2 до 120 обикновени знака без служебни символи.",
    empty: "Няма безопасни публични записи за това търсене.",
    resultsCount: "Намерени записи: {count}",
    unavailable:
      "Търсенето временно не е достъпно. Данните не са заменени с предположение.",
    retry: "Опитайте отново",
    browseArchive: "Преглед на архива EPPO",
    next: "Следващи записи",
    sourceCredit: "Източник",
    sourceLicense: "Лиценз",
    sourceAttribution: "Атрибуция",
    observed: "Наблюдавано",
    aliases: "Други безопасни имена",
    scientificName: "Научно име",
    taxonomicRank: "Таксономичен ранг",
    parentTaxon: "Родителски таксон",
    badges: {
      source_record_not_approved: "Запис от източник — не е одобрен",
      superseded_source_evidence: "Заменено свидетелство от източник",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Това е публично свидетелство от източник; все още не е продуктова идентичност на OverGarden.",
      superseded_source_evidence:
        "Източникът маркира свидетелството като неактивно или заменено; то не е продуктова идентичност на OverGarden.",
    },
    notFound: "Безопасен публичен запис не е намерен.",
  },
  ru: {
    title: "Архив источников EPPO",
    intro:
      "Наблюдаемые публичные данные EPPO Codes. Запись в этом архиве не является одобренной продуктовой идентичностью каталога OverGarden.",
    resultsTitle: "Записи источника",
    detailTitle: "Запись источника EPPO",
    searchLabel: "Поиск по названию или коду",
    searchPlaceholder: "Введите минимум 2 символа",
    searchButton: "Найти",
    reset: "Сбросить поиск",
    kindLabel: "Тип",
    kinds: {
      all: "Все",
      plant: "Растения",
      animal: "Животные",
    },
    invalidQuery:
      "Используйте от 2 до 120 обычных символов без служебных знаков.",
    empty: "По этому запросу нет безопасных публичных записей.",
    resultsCount: "Найдено записей: {count}",
    unavailable:
      "Поиск временно недоступен. Данные не заменены предположением.",
    retry: "Повторить",
    browseArchive: "Открыть архив EPPO",
    next: "Следующие записи",
    sourceCredit: "Источник",
    sourceLicense: "Лицензия",
    sourceAttribution: "Атрибуция",
    observed: "Наблюдено",
    aliases: "Другие безопасные названия",
    scientificName: "Научное название",
    taxonomicRank: "Таксономический ранг",
    parentTaxon: "Родительский таксон",
    badges: {
      source_record_not_approved: "Запись источника — не одобрено",
      superseded_source_evidence: "Устаревшее свидетельство источника",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Это публичное свидетельство источника; оно пока не является продуктовой идентичностью OverGarden.",
      superseded_source_evidence:
        "Источник помечает это свидетельство как неактивное или заменённое; оно не является продуктовой идентичностью OverGarden.",
    },
    notFound: "Безопасная публичная запись не найдена.",
  },
};

export function getEppoArchiveCopy(locale: PublicLocale): EppoArchiveCopy {
  return COPY[locale];
}
