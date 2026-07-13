import type { PublicLocale } from "@/lib/public-localization";

export interface SocialSurfaceCopy {
  my: string;
  tabs: {
    feed: string;
    notifications: string;
    bookmarks: string;
    wishlist: string;
  };
  feed: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    all: string;
    people: string;
    objects: string;
    topics: string;
    everyKind: string;
    plants: string;
    animals: string;
    bees: string;
    fromPerson: string;
    fromObject: string;
    fromTopic: string;
    more: string;
    sourceFiltersLabel: string;
    kindFiltersLabel: string;
  };
  notifications: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    all: string;
    unread: string;
    comments: string;
    replies: string;
    follows: string;
    mentions: string;
    claims: string;
    system: string;
    grouped: string;
    settings: string;
    saveSettings: string;
    markRead: string;
    markUnread: string;
    dismiss: string;
    more: string;
    filtersLabel: string;
    summaries: Record<string, string>;
  };
  bookmarks: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    all: string;
    journals: string;
    objects: string;
    varieties: string;
    topics: string;
    filtersLabel: string;
  };
  wishlist: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    all: string;
    plants: string;
    species: string;
    breeds: string;
    tryLater: string;
    start: string;
    filtersLabel: string;
  };
  common: {
    saved: string;
    remove: string;
    open: string;
    previous: string;
    next: string;
    itemCount: (count: number) => string;
    unreadCount: (count: number) => string;
    loadError: (surface: string) => string;
    retry: string;
  };
}

const COPY: Record<PublicLocale, SocialSurfaceCopy> = {
  uk: {
    my: "Моє",
    tabs: {
      feed: "Стрічка",
      notifications: "Сповіщення",
      bookmarks: "Закладки",
      wishlist: "Хочу спробувати",
    },
    feed: {
      title: "Стрічка підписок",
      description:
        "Нові публічні записи від людей, об'єктів і тем, за якими ви стежите.",
      signIn: "Увійдіть, щоб відкрити стрічку підписок.",
      empty:
        "Підпишіться на профіль, живий об'єкт або тему, і нові публічні записи з'являться тут.",
      all: "Усі",
      people: "Люди",
      objects: "Об'єкти",
      topics: "Теми",
      everyKind: "Усі типи",
      plants: "Рослини",
      animals: "Тварини",
      bees: "Бджолосім'ї",
      fromPerson: "Від автора",
      fromObject: "Від об'єкта",
      fromTopic: "За темою",
      more: "Показати наступні записи",
      sourceFiltersLabel: "Джерело записів",
      kindFiltersLabel: "Тип живого об'єкта",
    },
    notifications: {
      title: "Сповіщення",
      description:
        "Відповіді, підписки, згадки та дії з походженням в одному місці.",
      signIn: "Увійдіть, щоб відкрити сповіщення.",
      empty: "Нових сповіщень за цим фільтром немає.",
      all: "Усі",
      unread: "Непрочитані",
      comments: "Коментарі",
      replies: "Відповіді",
      follows: "Підписки",
      mentions: "Згадки",
      claims: "Походження",
      system: "Системні",
      grouped: "Групувати схожі",
      settings: "Налаштування",
      saveSettings: "Зберегти",
      markRead: "Позначити прочитаним",
      markUnread: "Позначити непрочитаним",
      dismiss: "Прибрати",
      more: "Показати наступні",
      filtersLabel: "Тип сповіщень",
      summaries: {
        comment_on_journal: "Новий коментар до вашого запису",
        reply_to_comment: "Нова відповідь на ваш коментар",
        profile_followed: "Новий підписник профілю",
        object_followed: "Хтось стежить за вашим об'єктом",
        lineage_followed: "Хтось стежить за походженням об'єкта",
        provenance_mention: "Ваш об'єкт згадано у запиті про походження",
        claim_decided: "Статус запиту про походження змінено",
        lineage_question: "Нове запитання про походження",
        stale_journal_prompt: "Час додати новий запис до журналу",
      },
    },
    bookmarks: {
      title: "Закладки",
      description: "Збережені публічні матеріали для повернення пізніше.",
      signIn: "Увійдіть, щоб відкрити закладки.",
      empty: "Збережіть запис, об'єкт, сорт або тему, і вони з'являться тут.",
      all: "Усі",
      journals: "Записи",
      objects: "Об'єкти",
      varieties: "Сорти",
      topics: "Теми",
      filtersLabel: "Тип закладок",
    },
    wishlist: {
      title: "Хочу спробувати",
      description: "Види, сорти й породи, які ви хочете додати згодом.",
      signIn: "Увійдіть, щоб відкрити список бажань.",
      empty:
        "Додайте каталожний об'єкт до списку, не створюючи його у своєму просторі.",
      all: "Усі",
      plants: "Сорти рослин",
      species: "Види",
      breeds: "Породи",
      tryLater: "Спробувати пізніше",
      start: "Почати вести журнал",
      filtersLabel: "Тип списку бажань",
    },
    common: {
      saved: "Збережено",
      remove: "Прибрати",
      open: "Відкрити",
      previous: "Назад",
      next: "Далі",
      itemCount: (count) => `${count} елементів`,
      unreadCount: (count) => `${count} непрочитаних`,
      loadError: (surface) => `Не вдалося завантажити: ${surface}`,
      retry: "Спробувати ще раз",
    },
  },
  bg: {
    my: "Моето",
    tabs: {
      feed: "Емисия",
      notifications: "Известия",
      bookmarks: "Отметки",
      wishlist: "Искам да опитам",
    },
    feed: {
      title: "Емисия от следвани",
      description:
        "Нови публични записи от хора, обекти и теми, които следвате.",
      signIn: "Влезте, за да отворите емисията си.",
      empty:
        "Последвайте профил, жив обект или тема и новите публични записи ще се появят тук.",
      all: "Всички",
      people: "Хора",
      objects: "Обекти",
      topics: "Теми",
      everyKind: "Всички типове",
      plants: "Растения",
      animals: "Животни",
      bees: "Пчелни семейства",
      fromPerson: "От автор",
      fromObject: "От обект",
      fromTopic: "По тема",
      more: "Покажи следващите записи",
      sourceFiltersLabel: "Източник на записите",
      kindFiltersLabel: "Тип жив обект",
    },
    notifications: {
      title: "Известия",
      description:
        "Отговори, следвания, споменавания и произход на едно място.",
      signIn: "Влезте, за да отворите известията.",
      empty: "Няма известия за този филтър.",
      all: "Всички",
      unread: "Непрочетени",
      comments: "Коментари",
      replies: "Отговори",
      follows: "Следвания",
      mentions: "Споменавания",
      claims: "Произход",
      system: "Системни",
      grouped: "Групирай сходните",
      settings: "Настройки",
      saveSettings: "Запази",
      markRead: "Маркирай като прочетено",
      markUnread: "Маркирай като непрочетено",
      dismiss: "Премахни",
      more: "Покажи следващите",
      filtersLabel: "Тип известия",
      summaries: {
        comment_on_journal: "Нов коментар към ваш запис",
        reply_to_comment: "Нов отговор на ваш коментар",
        profile_followed: "Нов последовател на профила",
        object_followed: "Някой следва ваш обект",
        lineage_followed: "Някой следва произхода на обект",
        provenance_mention: "Ваш обект е споменат в заявка за произход",
        claim_decided: "Статусът на заявка за произход е променен",
        lineage_question: "Нов въпрос за произход",
        stale_journal_prompt: "Време е за нов запис в дневника",
      },
    },
    bookmarks: {
      title: "Отметки",
      description: "Запазени публични материали, към които да се върнете.",
      signIn: "Влезте, за да отворите отметките.",
      empty: "Запазете запис, обект, сорт или тема и те ще се появят тук.",
      all: "Всички",
      journals: "Записи",
      objects: "Обекти",
      varieties: "Сортове",
      topics: "Теми",
      filtersLabel: "Тип отметки",
    },
    wishlist: {
      title: "Искам да опитам",
      description:
        "Видове, сортове и породи, които искате да добавите по-късно.",
      signIn: "Влезте, за да отворите списъка с желания.",
      empty:
        "Добавете каталожен обект, без още да създавате обект в пространството си.",
      all: "Всички",
      plants: "Растителни сортове",
      species: "Видове",
      breeds: "Породи",
      tryLater: "Опитай по-късно",
      start: "Започни дневник",
      filtersLabel: "Тип списък с желания",
    },
    common: {
      saved: "Запазено",
      remove: "Премахни",
      open: "Отвори",
      previous: "Назад",
      next: "Напред",
      itemCount: (count) => `${count} елемента`,
      unreadCount: (count) => `${count} непрочетени`,
      loadError: (surface) => `Неуспешно зареждане: ${surface}`,
      retry: "Опитай отново",
    },
  },
  ru: {
    my: "Моё",
    tabs: {
      feed: "Лента",
      notifications: "Уведомления",
      bookmarks: "Закладки",
      wishlist: "Хочу попробовать",
    },
    feed: {
      title: "Лента подписок",
      description:
        "Новые публичные записи людей, объектов и тем, на которые вы подписаны.",
      signIn: "Войдите, чтобы открыть ленту подписок.",
      empty:
        "Подпишитесь на профиль, живой объект или тему, и новые публичные записи появятся здесь.",
      all: "Все",
      people: "Люди",
      objects: "Объекты",
      topics: "Темы",
      everyKind: "Все типы",
      plants: "Растения",
      animals: "Животные",
      bees: "Пчелиные семьи",
      fromPerson: "От автора",
      fromObject: "От объекта",
      fromTopic: "По теме",
      more: "Показать следующие записи",
      sourceFiltersLabel: "Источник записей",
      kindFiltersLabel: "Тип живого объекта",
    },
    notifications: {
      title: "Уведомления",
      description:
        "Ответы, подписки, упоминания и действия с происхождением в одном месте.",
      signIn: "Войдите, чтобы открыть уведомления.",
      empty: "Уведомлений по этому фильтру нет.",
      all: "Все",
      unread: "Непрочитанные",
      comments: "Комментарии",
      replies: "Ответы",
      follows: "Подписки",
      mentions: "Упоминания",
      claims: "Происхождение",
      system: "Системные",
      grouped: "Группировать похожие",
      settings: "Настройки",
      saveSettings: "Сохранить",
      markRead: "Отметить прочитанным",
      markUnread: "Отметить непрочитанным",
      dismiss: "Убрать",
      more: "Показать следующие",
      filtersLabel: "Тип уведомлений",
      summaries: {
        comment_on_journal: "Новый комментарий к вашей записи",
        reply_to_comment: "Новый ответ на ваш комментарий",
        profile_followed: "Новый подписчик профиля",
        object_followed: "Кто-то следит за вашим объектом",
        lineage_followed: "Кто-то следит за происхождением объекта",
        provenance_mention: "Ваш объект упомянут в запросе о происхождении",
        claim_decided: "Статус запроса о происхождении изменён",
        lineage_question: "Новый вопрос о происхождении",
        stale_journal_prompt: "Время добавить новую запись в журнал",
      },
    },
    bookmarks: {
      title: "Закладки",
      description:
        "Сохранённые публичные материалы, к которым можно вернуться.",
      signIn: "Войдите, чтобы открыть закладки.",
      empty: "Сохраните запись, объект, сорт или тему, и они появятся здесь.",
      all: "Все",
      journals: "Записи",
      objects: "Объекты",
      varieties: "Сорта",
      topics: "Темы",
      filtersLabel: "Тип закладок",
    },
    wishlist: {
      title: "Хочу попробовать",
      description: "Виды, сорта и породы, которые вы хотите добавить позже.",
      signIn: "Войдите, чтобы открыть список желаний.",
      empty: "Добавьте объект каталога, не создавая его в своём пространстве.",
      all: "Все",
      plants: "Сорта растений",
      species: "Виды",
      breeds: "Породы",
      tryLater: "Попробовать позже",
      start: "Начать журнал",
      filtersLabel: "Тип списка желаний",
    },
    common: {
      saved: "Сохранено",
      remove: "Убрать",
      open: "Открыть",
      previous: "Назад",
      next: "Далее",
      itemCount: (count) => `${count} элементов`,
      unreadCount: (count) => `${count} непрочитанных`,
      loadError: (surface) => `Не удалось загрузить: ${surface}`,
      retry: "Попробовать снова",
    },
  },
};

export function getSocialSurfaceCopy(locale: PublicLocale) {
  return COPY[locale];
}
