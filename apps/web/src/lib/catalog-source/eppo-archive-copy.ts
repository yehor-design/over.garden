import type { PublicLocale } from "@/lib/public-localization";
import type {
  EppoArchiveEvidenceState,
  EppoArchiveKind,
} from "@/server/catalog-source/public-eppo-explorer-repository";

/**
 * The EPPO archive's words (`OVE-499`).
 *
 * The archive is a reference: EPPO's own records as OverGarden received them,
 * each with its source's credit and licence. It is not a way into the garden,
 * so it says what it is, points a gardener to the catalogue, and never calls a
 * record "safe", "approved" or "a product identity" — that was the team's
 * vocabulary, not the reader's.
 */
export interface EppoArchiveCopy {
  eyebrow: string;
  title: string;
  intro: string;
  /** Where a gardener looking for a plant or an animal should go instead. */
  catalogueHint: string;
  catalogueLink: string;
  resultsTitle: string;
  /** How many records the page shows — never a nought. */
  resultsCount: (count: number) => string;
  showAll: string;
  detailTitle: string;
  /** OVE-394: the archive record now has a canonical card to walk to. */
  canonicalCard: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  kindLabel: string;
  kinds: Record<EppoArchiveKind, string>;
  invalidQuery: string;
  /** The archive holds nothing at all. */
  empty: string;
  /** A search found nothing. */
  noResults: (query: string) => string;
  unavailable: string;
  retry: string;
  browseArchive: string;
  next: string;
  sourceCredit: string;
  sourceLicense: string;
  sourceAttribution: string;
  observed: string;
  code: string;
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
    eyebrow: "Довідкове джерело",
    title: "Архів EPPO",
    intro:
      "Коди й назви рослин і тварин з EPPO Global Database — такими, якими OverGarden їх отримав. Це записи джерела для довідки, а не картки каталогу OverGarden.",
    catalogueHint:
      "Що це за рослина чи тварина і що про неї записали садівники — розповідає каталог.",
    catalogueLink: "Відкрити каталог",
    resultsTitle: "Записи",
    resultsCount: (count) => `Показано: ${count.toLocaleString("uk-UA")}`,
    showAll: "Показати всі записи",
    detailTitle: "Запис EPPO",
    canonicalCard: "Картка в каталозі OverGarden",
    searchLabel: "Назва або код EPPO",
    searchPlaceholder: "Наприклад, Solanum або LYPES",
    searchButton: "Шукати",
    kindLabel: "Рослини чи тварини",
    kinds: {
      all: "Усі",
      plant: "Рослини",
      animal: "Тварини",
    },
    invalidQuery:
      "Введіть від 2 до 120 символів; знаки %, _ і \\ не підходять.",
    empty: "В архіві поки немає жодного запису.",
    noResults: (query) => `За «${query}» записів немає.`,
    unavailable: "Архів тимчасово недоступний. Спробуйте ще раз за хвилину.",
    retry: "Спробувати ще раз",
    browseArchive: "До архіву EPPO",
    next: "Наступні записи",
    sourceCredit: "Джерело",
    sourceLicense: "Ліцензія",
    sourceAttribution: "Зазначення джерела",
    observed: "Отримано",
    code: "Код EPPO",
    aliases: "Інші назви",
    scientificName: "Наукова назва",
    taxonomicRank: "Ранг",
    parentTaxon: "Вищий таксон",
    badges: {
      source_record_not_approved: "Запис джерела",
      superseded_source_evidence: "Замінений у джерелі",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Запис з EPPO у тому вигляді, в якому його подає джерело. Він служить довідкою і не є карткою каталогу OverGarden.",
      superseded_source_evidence:
        "Джерело позначило цей запис як неактивний або замінений іншим.",
    },
    notFound: "Такого запису в архіві немає.",
  },
  bg: {
    eyebrow: "Справочен източник",
    title: "Архив EPPO",
    intro:
      "Кодове и имена на растения и животни от EPPO Global Database — такива, каквито OverGarden ги е получил. Това са записи от източника за справка, а не карти от каталога на OverGarden.",
    catalogueHint:
      "Какво е растението или животното и какво са записали градинарите за него — вижте в каталога.",
    catalogueLink: "Към каталога",
    resultsTitle: "Записи",
    resultsCount: (count) => `Показани: ${count.toLocaleString("bg-BG")}`,
    showAll: "Покажи всички записи",
    detailTitle: "Запис от EPPO",
    canonicalCard: "Карта в каталога на OverGarden",
    searchLabel: "Име или код на EPPO",
    searchPlaceholder: "Например Solanum или LYPES",
    searchButton: "Търсене",
    kindLabel: "Растения или животни",
    kinds: {
      all: "Всички",
      plant: "Растения",
      animal: "Животни",
    },
    invalidQuery:
      "Въведете от 2 до 120 знака; знаците %, _ и \\ не са позволени.",
    empty: "В архива все още няма нито един запис.",
    noResults: (query) => `За „${query}“ няма записи.`,
    unavailable: "Архивът временно не е достъпен. Опитайте отново след минута.",
    retry: "Опитайте отново",
    browseArchive: "Към архива EPPO",
    next: "Следващи записи",
    sourceCredit: "Източник",
    sourceLicense: "Лиценз",
    sourceAttribution: "Посочване на източника",
    observed: "Получено",
    code: "Код на EPPO",
    aliases: "Други имена",
    scientificName: "Научно име",
    taxonomicRank: "Ранг",
    parentTaxon: "По-висок таксон",
    badges: {
      source_record_not_approved: "Запис от източника",
      superseded_source_evidence: "Заменен в източника",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Запис от EPPO, какъвто го дава източникът. Служи за справка и не е карта от каталога на OverGarden.",
      superseded_source_evidence:
        "Източникът е отбелязал този запис като неактивен или заменен с друг.",
    },
    notFound: "Такъв запис в архива няма.",
  },
  ru: {
    eyebrow: "Справочный источник",
    title: "Архив EPPO",
    intro:
      "Коды и названия растений и животных из EPPO Global Database — такими, какими OverGarden их получил. Это записи источника для справки, а не карточки каталога OverGarden.",
    catalogueHint:
      "Что это за растение или животное и что о нём записали садоводы — рассказывает каталог.",
    catalogueLink: "Открыть каталог",
    resultsTitle: "Записи",
    resultsCount: (count) => `Показано: ${count.toLocaleString("ru-RU")}`,
    showAll: "Показать все записи",
    detailTitle: "Запись EPPO",
    canonicalCard: "Карточка в каталоге OverGarden",
    searchLabel: "Название или код EPPO",
    searchPlaceholder: "Например, Solanum или LYPES",
    searchButton: "Найти",
    kindLabel: "Растения или животные",
    kinds: {
      all: "Все",
      plant: "Растения",
      animal: "Животные",
    },
    invalidQuery: "Введите от 2 до 120 символов; знаки %, _ и \\ не подходят.",
    empty: "В архиве пока нет ни одной записи.",
    noResults: (query) => `По «${query}» записей нет.`,
    unavailable: "Архив временно недоступен. Попробуйте ещё раз через минуту.",
    retry: "Повторить",
    browseArchive: "К архиву EPPO",
    next: "Следующие записи",
    sourceCredit: "Источник",
    sourceLicense: "Лицензия",
    sourceAttribution: "Указание источника",
    observed: "Получено",
    code: "Код EPPO",
    aliases: "Другие названия",
    scientificName: "Научное название",
    taxonomicRank: "Ранг",
    parentTaxon: "Вышестоящий таксон",
    badges: {
      source_record_not_approved: "Запись источника",
      superseded_source_evidence: "Заменена в источнике",
    },
    evidenceDescription: {
      source_record_not_approved:
        "Запись из EPPO в том виде, в каком её даёт источник. Она служит справкой и не является карточкой каталога OverGarden.",
      superseded_source_evidence:
        "Источник пометил эту запись как неактивную или заменённую другой.",
    },
    notFound: "Такой записи в архиве нет.",
  },
};

export function getEppoArchiveCopy(locale: PublicLocale): EppoArchiveCopy {
  return COPY[locale];
}
