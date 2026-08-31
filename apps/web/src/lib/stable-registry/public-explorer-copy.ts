import type { PublicLocale } from "@/lib/public-localization";
import type {
  PublicStableRegistryEvidenceState,
  PublicStableRegistryKind,
  PublicStableRegistrySurface,
} from "@/server/catalog-source/public-eppo-explorer-repository";

export interface PublicStableRegistryExplorerCopy {
  catalog: {
    title: string;
    intro: string;
    resultsTitle: string;
    detailTitle: string;
  };
  eppo: {
    title: string;
    intro: string;
    resultsTitle: string;
    detailTitle: string;
  };
  navigation: { catalog: string; eppo: string };
  searchLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  reset: string;
  kindLabel: string;
  // `either` is not a filter option — it labels one record whose kingdom the
  // approved catalog has never established. The filter tabs stay all/plant/animal.
  kinds: Record<PublicStableRegistryKind | "either", string>;
  invalidQuery: string;
  empty: string;
  resultsCount: string;
  unavailable: string;
  retry: string;
  browseCatalog: string;
  browseEppo: string;
  next: string;
  previous: string;
  sourceCredit: string;
  sourceLicense: string;
  sourceAttribution: string;
  observed: string;
  aliases: string;
  scientificName: string;
  taxonomicRank: string;
  parentTaxon: string;
  badges: Record<PublicStableRegistryEvidenceState, string>;
  evidenceDescription: Record<PublicStableRegistryEvidenceState, string>;
  notFound: string;
}

const COPY: Record<PublicLocale, PublicStableRegistryExplorerCopy> = {
  uk: {
    catalog: {
      title: "Стабільний каталог",
      intro:
        "Лише схвалені записи Stable Registry OverGarden. Дані джерел, що ще не пройшли всі незалежні перевірки, тут не показуються.",
      resultsTitle: "Схвалені таксони",
      detailTitle: "Запис стабільного каталогу",
    },
    eppo: {
      title: "Архів джерел EPPO",
      intro:
        "Спостережені публічні дані EPPO Codes. Запис у цьому архіві не є схваленим ідентифікатором продуктового каталогу OverGarden.",
      resultsTitle: "Записи джерела",
      detailTitle: "Запис джерела EPPO",
    },
    navigation: { catalog: "Стабільний каталог", eppo: "Джерела EPPO" },
    searchLabel: "Пошук за назвою або кодом",
    searchPlaceholder: "Введіть щонайменше 2 символи",
    searchButton: "Шукати",
    reset: "Скинути пошук",
    kindLabel: "Тип",
    kinds: {
      all: "Усі",
      plant: "Рослини",
      animal: "Тварини",
      either: "Рослина або тварина",
    },
    invalidQuery:
      "Використайте від 2 до 120 звичайних символів без службових знаків.",
    empty: "За цим запитом безпечних публічних записів немає.",
    resultsCount: "Знайдено записів: {count}",
    unavailable:
      "Пошук тимчасово недоступний. Дані не були замінені припущенням.",
    retry: "Спробувати ще раз",
    browseCatalog: "Переглянути каталог",
    browseEppo: "Переглянути архів EPPO",
    next: "Наступні записи",
    previous: "Назад",
    sourceCredit: "Джерело",
    sourceLicense: "Ліцензія",
    sourceAttribution: "Атрибуція",
    observed: "Спостережено",
    aliases: "Інші безпечні назви",
    scientificName: "Наукова назва",
    taxonomicRank: "Таксономічний ранг",
    parentTaxon: "Батьківський таксон",
    badges: {
      approved_stable_registry: "Схвалено Stable Registry",
      source_record_not_approved: "Запис джерела — не схвалено",
      superseded_source_evidence: "Застаріле джерельне свідчення",
    },
    evidenceDescription: {
      approved_stable_registry:
        "Цей запис входить до активного схваленого релізу Stable Registry.",
      source_record_not_approved:
        "Це публічне свідчення джерела; воно ще не є продуктовою ідентичністю OverGarden.",
      superseded_source_evidence:
        "Джерело позначає це свідчення як неактивне або замінене; воно не є продуктовою ідентичністю OverGarden.",
    },
    notFound: "Безпечний публічний запис не знайдено.",
  },
  bg: {
    catalog: {
      title: "Стабилен каталог",
      intro:
        "Само одобрени записи от Stable Registry на OverGarden. Данни от източници, които не са минали всички независими проверки, не се показват тук.",
      resultsTitle: "Одобрени таксони",
      detailTitle: "Запис от стабилния каталог",
    },
    eppo: {
      title: "Архив на източниците EPPO",
      intro:
        "Наблюдавани публични данни от EPPO Codes. Записът тук не е одобрена продуктова идентичност в каталога на OverGarden.",
      resultsTitle: "Записи от източника",
      detailTitle: "Запис от източника EPPO",
    },
    navigation: { catalog: "Стабилен каталог", eppo: "Източници EPPO" },
    searchLabel: "Търсене по име или код",
    searchPlaceholder: "Въведете поне 2 знака",
    searchButton: "Търсене",
    reset: "Изчистване на търсенето",
    kindLabel: "Тип",
    kinds: {
      all: "Всички",
      plant: "Растения",
      animal: "Животни",
      either: "Растение или животно",
    },
    invalidQuery:
      "Използвайте от 2 до 120 обикновени знака без служебни символи.",
    empty: "Няма безопасни публични записи за това търсене.",
    resultsCount: "Намерени записи: {count}",
    unavailable:
      "Търсенето временно не е достъпно. Данните не са заменени с предположение.",
    retry: "Опитайте отново",
    browseCatalog: "Преглед на каталога",
    browseEppo: "Преглед на архива EPPO",
    next: "Следващи записи",
    previous: "Назад",
    sourceCredit: "Източник",
    sourceLicense: "Лиценз",
    sourceAttribution: "Атрибуция",
    observed: "Наблюдавано",
    aliases: "Други безопасни имена",
    scientificName: "Научно име",
    taxonomicRank: "Таксономичен ранг",
    parentTaxon: "Родителски таксон",
    badges: {
      approved_stable_registry: "Одобрено в Stable Registry",
      source_record_not_approved: "Запис от източник — не е одобрен",
      superseded_source_evidence: "Заменено свидетелство от източник",
    },
    evidenceDescription: {
      approved_stable_registry:
        "Този запис е част от активен одобрен релийз на Stable Registry.",
      source_record_not_approved:
        "Това е публично свидетелство от източник; все още не е продуктова идентичност на OverGarden.",
      superseded_source_evidence:
        "Източникът маркира свидетелството като неактивно или заменено; то не е продуктова идентичност на OverGarden.",
    },
    notFound: "Безопасен публичен запис не е намерен.",
  },
  ru: {
    catalog: {
      title: "Стабильный каталог",
      intro:
        "Только одобренные записи Stable Registry OverGarden. Данные источников, не прошедшие независимые проверки, здесь не показываются.",
      resultsTitle: "Одобренные таксоны",
      detailTitle: "Запись стабильного каталога",
    },
    eppo: {
      title: "Архив источников EPPO",
      intro:
        "Наблюдаемые публичные данные EPPO Codes. Запись в этом архиве не является одобренной продуктовой идентичностью каталога OverGarden.",
      resultsTitle: "Записи источника",
      detailTitle: "Запись источника EPPO",
    },
    navigation: { catalog: "Стабильный каталог", eppo: "Источники EPPO" },
    searchLabel: "Поиск по названию или коду",
    searchPlaceholder: "Введите минимум 2 символа",
    searchButton: "Найти",
    reset: "Сбросить поиск",
    kindLabel: "Тип",
    kinds: {
      all: "Все",
      plant: "Растения",
      animal: "Животные",
      either: "Растение или животное",
    },
    invalidQuery:
      "Используйте от 2 до 120 обычных символов без служебных знаков.",
    empty: "По этому запросу нет безопасных публичных записей.",
    resultsCount: "Найдено записей: {count}",
    unavailable:
      "Поиск временно недоступен. Данные не заменены предположением.",
    retry: "Повторить",
    browseCatalog: "Открыть каталог",
    browseEppo: "Открыть архив EPPO",
    next: "Следующие записи",
    previous: "Назад",
    sourceCredit: "Источник",
    sourceLicense: "Лицензия",
    sourceAttribution: "Атрибуция",
    observed: "Наблюдено",
    aliases: "Другие безопасные названия",
    scientificName: "Научное название",
    taxonomicRank: "Таксономический ранг",
    parentTaxon: "Родительский таксон",
    badges: {
      approved_stable_registry: "Одобрено Stable Registry",
      source_record_not_approved: "Запись источника — не одобрено",
      superseded_source_evidence: "Устаревшее свидетельство источника",
    },
    evidenceDescription: {
      approved_stable_registry:
        "Эта запись входит в активный одобренный релиз Stable Registry.",
      source_record_not_approved:
        "Это публичное свидетельство источника; оно пока не является продуктовой идентичностью OverGarden.",
      superseded_source_evidence:
        "Источник помечает это свидетельство как неактивное или заменённое; оно не является продуктовой идентичностью OverGarden.",
    },
    notFound: "Безопасная публичная запись не найдена.",
  },
};

export function getPublicStableRegistryExplorerCopy(locale: PublicLocale) {
  return COPY[locale];
}

export function publicStableRegistrySurfaceCopy(
  copy: PublicStableRegistryExplorerCopy,
  surface: PublicStableRegistrySurface,
) {
  return surface === "catalog" ? copy.catalog : copy.eppo;
}
