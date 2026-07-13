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
    feed: string;
    livingObjects: string;
    journals: string;
    communities: string;
    knowledge: string;
    myGarden: string;
    addObject: string;
    addUpdate: string;
    drafts: string;
    garden: string;
    followedFeed: string;
    notifications: string;
    bookmarks: string;
    wishlist: string;
    lineageClaims: string;
    profile: string;
    publicProfile: string;
    signIn: string;
  };
  shell: {
    exploreSection: string;
    mySection: string;
    menuTitle: string;
    menuDescription: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    siteNavigation: string;
    mobileNavigation: string;
    contextTitle: string;
    contextDescription: string;
    startJournal: string;
    privacy: string;
    account: string;
    loadingTitle: string;
    errorEyebrow: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
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
      feed: "Стрічка",
      livingObjects: "Живі об'єкти",
      journals: "Журнали",
      communities: "Спільноти",
      knowledge: "Знання",
      myGarden: "Мій сад",
      addObject: "Додати об'єкт",
      addUpdate: "Новий запис",
      drafts: "Чернетки",
      garden: "Сад",
      followedFeed: "Стрічка підписок",
      notifications: "Сповіщення",
      bookmarks: "Закладки",
      wishlist: "Список бажань",
      lineageClaims: "Запити щодо походження",
      profile: "Профіль",
      publicProfile: "Публічний профіль",
      signIn: "Увійти",
    },
    shell: {
      exploreSection: "Огляд",
      mySection: "Моє",
      menuTitle: "Навігація OverGarden",
      menuDescription: "Публічні розділи та ваш особистий сад.",
      search: "Пошук",
      openMenu: "Відкрити навігацію",
      closeMenu: "Закрити навігацію",
      siteNavigation: "Основна навігація",
      mobileNavigation: "Основна мобільна навігація",
      contextTitle: "Далі",
      contextDescription:
        "Продовжуйте читати публічні історії або відкрийте власний журнал.",
      startJournal: "Почати журнал",
      privacy: "Приватність",
      account: "Обліковий запис",
      loadingTitle: "Завантаження OverGarden",
      errorEyebrow: "Не вдалося відкрити розділ",
      errorTitle: "Цю сторінку не вдалося завантажити",
      errorDescription:
        "Спробуйте ще раз. Ви можете продовжити навігацію в OverGarden, якщо помилка повториться.",
      retry: "Спробувати ще раз",
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
      feed: "Поток",
      livingObjects: "Живи обекти",
      journals: "Дневници",
      communities: "Общности",
      knowledge: "Знания",
      myGarden: "Моята градина",
      addObject: "Добавяне на обект",
      addUpdate: "Нов запис",
      drafts: "Чернови",
      garden: "Градина",
      followedFeed: "Следвани записи",
      notifications: "Известия",
      bookmarks: "Отметки",
      wishlist: "Желани",
      lineageClaims: "Заявки за произход",
      profile: "Профил",
      publicProfile: "Публичен профил",
      signIn: "Вход",
    },
    shell: {
      exploreSection: "Разглеждане",
      mySection: "Моето",
      menuTitle: "Навигация в OverGarden",
      menuDescription: "Публичните раздели и вашата лична градина.",
      search: "Търсене",
      openMenu: "Отваряне на навигацията",
      closeMenu: "Затваряне на навигацията",
      siteNavigation: "Основна навигация",
      mobileNavigation: "Основна мобилна навигация",
      contextTitle: "Следващо",
      contextDescription:
        "Продължете с публичните истории или отворете свой дневник.",
      startJournal: "Започване на дневник",
      privacy: "Поверителност",
      account: "Профил",
      loadingTitle: "Зареждане на OverGarden",
      errorEyebrow: "Разделът не може да се отвори",
      errorTitle: "Тази страница не може да се зареди",
      errorDescription:
        "Опитайте отново. Ако грешката се повтори, можете да продължите да разглеждате OverGarden.",
      retry: "Опитайте отново",
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
      feed: "Лента",
      livingObjects: "Живые объекты",
      journals: "Журналы",
      communities: "Сообщества",
      knowledge: "Знания",
      myGarden: "Мой сад",
      addObject: "Добавить объект",
      addUpdate: "Новая запись",
      drafts: "Черновики",
      garden: "Сад",
      followedFeed: "Лента подписок",
      notifications: "Уведомления",
      bookmarks: "Закладки",
      wishlist: "Список желаний",
      lineageClaims: "Заявки о происхождении",
      profile: "Профиль",
      publicProfile: "Публичный профиль",
      signIn: "Войти",
    },
    shell: {
      exploreSection: "Обзор",
      mySection: "Моё",
      menuTitle: "Навигация OverGarden",
      menuDescription: "Публичные разделы и ваш личный сад.",
      search: "Поиск",
      openMenu: "Открыть навигацию",
      closeMenu: "Закрыть навигацию",
      siteNavigation: "Основная навигация",
      mobileNavigation: "Основная мобильная навигация",
      contextTitle: "Дальше",
      contextDescription:
        "Продолжайте читать публичные истории или откройте свой журнал.",
      startJournal: "Начать журнал",
      privacy: "Конфиденциальность",
      account: "Аккаунт",
      loadingTitle: "Загрузка OverGarden",
      errorEyebrow: "Не удалось открыть раздел",
      errorTitle: "Не удалось загрузить эту страницу",
      errorDescription:
        "Попробуйте ещё раз. Если ошибка повторится, вы сможете продолжить навигацию по OverGarden.",
      retry: "Повторить",
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
