import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  selectPublicLocaleFromRequestContext,
  type PublicLocale,
} from "./public-localization";

export type InterfaceLocale = PublicLocale;

export const INTERFACE_LOCALE_COOKIE_NAME = "overgarden_interface_locale";
export const INTERFACE_LOCALE_REQUEST_HEADER = "x-overgarden-interface-locale";
export const INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type LocaleCandidate = string | null | undefined;

export interface InterfaceCopy {
  metadata: {
    workspaceTitle: string;
    workspaceDescription: string;
  };
  navigation: {
    garden: string;
    followedFeed: string;
    notifications: string;
    bookmarks: string;
    lineageClaims: string;
    publicProfile: string;
  };
  workspace: {
    title: string;
    returningDescription: string;
    emptyDescription: string;
  };
  object: {
    gardenJournal: string;
    livingObject: string;
    backToJournal: string;
  };
}

const INTERFACE_COPY = {
  uk: {
    metadata: {
      workspaceTitle: "Простір саду | OverGarden",
      workspaceDescription:
        "Приватний простір для живих об'єктів, датованих записів і наступних дій у саду.",
    },
    navigation: {
      garden: "Сад",
      followedFeed: "Стрічка підписок",
      notifications: "Сповіщення",
      bookmarks: "Закладки",
      lineageClaims: "Запити щодо походження",
      publicProfile: "Публічний профіль",
    },
    workspace: {
      title: "Простір саду",
      returningDescription:
        "Ваші живі об'єкти, останні зміни й наступна дія в журналі в одному приватному місці.",
      emptyDescription:
        "Почніть з одного приватного живого об'єкта, а потім повертайтеся сюди щоразу, коли його історія змінюється.",
    },
    object: {
      gardenJournal: "Садовий журнал",
      livingObject: "Живий об'єкт",
      backToJournal: "Назад до журналу",
    },
  },
  bg: {
    metadata: {
      workspaceTitle: "Градинско пространство | OverGarden",
      workspaceDescription:
        "Лично пространство за живи обекти, датирани записи и следващи действия в градината.",
    },
    navigation: {
      garden: "Градина",
      followedFeed: "Следвани записи",
      notifications: "Известия",
      bookmarks: "Отметки",
      lineageClaims: "Заявки за произход",
      publicProfile: "Публичен профил",
    },
    workspace: {
      title: "Градинско пространство",
      returningDescription:
        "Вашите живи обекти, последните промени и следващото действие в дневника на едно лично място.",
      emptyDescription:
        "Започнете с един личен жив обект, след което се връщайте тук винаги когато историята му се променя.",
    },
    object: {
      gardenJournal: "Градински дневник",
      livingObject: "Жив обект",
      backToJournal: "Назад към дневника",
    },
  },
  ru: {
    metadata: {
      workspaceTitle: "Пространство сада | OverGarden",
      workspaceDescription:
        "Личное пространство для живых объектов, датированных записей и следующих действий в саду.",
    },
    navigation: {
      garden: "Сад",
      followedFeed: "Лента подписок",
      notifications: "Уведомления",
      bookmarks: "Закладки",
      lineageClaims: "Заявки о происхождении",
      publicProfile: "Публичный профиль",
    },
    workspace: {
      title: "Пространство сада",
      returningDescription:
        "Ваши живые объекты, последние изменения и следующее действие в журнале в одном личном месте.",
      emptyDescription:
        "Начните с одного личного живого объекта, а затем возвращайтесь сюда каждый раз, когда его история меняется.",
    },
    object: {
      gardenJournal: "Садовый журнал",
      livingObject: "Живой объект",
      backToJournal: "Назад к журналу",
    },
  },
} satisfies Record<InterfaceLocale, InterfaceCopy>;

export function normalizeInterfaceLocale(
  value: LocaleCandidate,
): InterfaceLocale | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return isPublicLocale(normalized) ? normalized : null;
}

export function resolveInterfaceLocale(input: {
  explicitLocale?: LocaleCandidate;
  routeLocale?: LocaleCandidate;
  persistedLocale?: LocaleCandidate;
  countryCode?: string | null;
  acceptLanguage?: string | null;
}): InterfaceLocale {
  const explicitLocale = normalizeInterfaceLocale(input.explicitLocale);
  if (explicitLocale) return explicitLocale;

  const routeLocale = normalizeInterfaceLocale(input.routeLocale);
  if (routeLocale) return routeLocale;

  const persistedLocale = normalizeInterfaceLocale(input.persistedLocale);
  if (persistedLocale) return persistedLocale;

  return selectPublicLocaleFromRequestContext({
    countryCode: input.countryCode ?? null,
    acceptLanguage: input.acceptLanguage ?? null,
  });
}

export function getInterfaceCopy(
  locale: InterfaceLocale = DEFAULT_PUBLIC_LOCALE,
): InterfaceCopy {
  return INTERFACE_COPY[locale];
}
