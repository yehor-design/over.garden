import type { PublicLocale } from "@/lib/public-localization";

export interface SocialSurfaceCopy {
  my: string;
  tabs: {
    feed: string;
    notifications: string;
    bookmarks: string;
  };
  feed: {
    title: string;
    description: string;
    signIn: string;
    signedOutPublic: string;
    empty: string;
    emptyTitle: string;
    emptyAction: string;
    all: string;
    people: string;
    objects: string;
    topics: string;
    everyKind: string;
    plants: string;
    animals: string;
    fromPerson: string;
    fromObject: string;
    fromTopic: string;
    sourceFiltersLabel: string;
    kindFiltersLabel: string;
  };
  notifications: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    emptyTitle: string;
    emptyAction: string;
    unreadBadge: string;
    readBadge: string;
    /** A grouped row's unread part: "Непрочитані: {count}". */
    unreadOfGroup: string;
    all: string;
    unread: string;
    comments: string;
    follows: string;
    mentions: string;
    claims: string;
    /** The journaling reminders' chip; it said «Системні» (`OVE-501`). */
    reminders: string;
    grouped: string;
    settings: string;
    markRead: string;
    markUnread: string;
    dismiss: string;
    filtersLabel: string;
    listLabel: string;
    /** Who did it: "Від {actors}". */
    from: string;
    /** When the actor's public profile is gone. */
    fromSomeone: string;
    /** "{actors} та ще {count}". */
    andOthers: string;
    /** What a reminder is, where a social row names who acted. */
    reminderOrigin: string;
    lastEntry: string;
    never: string;
    /** How two same-named objects are told apart: "додано {date}". */
    addedOn: string;
    /** And two added the same day: "додано {date} о {time}". */
    addedAt: string;
    write: string;
    writeLabel: string;
    /** A row control's full name: "{action}: {name}". */
    rowAction: string;
    kinds: { plant: string; animal: string };
    outcome: {
      read: string;
      unread: string;
      dismissed: string;
      failed: string;
    };
    loadErrorTitle: string;
    summaries: Record<string, string>;
    settingsPage: {
      title: string;
      description: string;
      back: string;
      social: string;
      reminders: string;
      options: {
        comments: string;
        replies: string;
        follows: string;
        mentions: string;
        claims: string;
        system: string;
      };
      reminderHint: string;
      save: string;
      saved: string;
      failed: string;
      signIn: string;
      loadErrorTitle: string;
    };
  };
  bookmarks: {
    title: string;
    description: string;
    signIn: string;
    empty: string;
    emptyTitle: string;
    emptyAction: string;
    all: string;
    journals: string;
    objects: string;
    varieties: string;
    topics: string;
    filtersLabel: string;
    /** "«{name}» прибрано із закладок" — the removal says what it removed. */
    removedNotice: string;
    /** When the removed thing has no public name any more. */
    removedNoticeUnnamed: string;
    restoredNotice: string;
    restoredNoticeUnnamed: string;
    removeLabel: string;
    failed: { remove: string; restore: string };
    unavailableTitle: string;
    unavailable: {
      journal_entry: string;
      lineage_object: string;
      variety: string;
      topic: string;
    };
  };
  common: {
    saved: string;
    remove: string;
    open: string;
    itemCount: (count: number) => string;
    unreadCount: (count: number) => string;
    loadError: (surface: string) => string;
    retry: string;
    noResultsTitle: string;
    noResultsDescription: string;
    clearFilters: string;
    undo: string;
    dismissNotice: string;
    noticeRegion: string;
  };
}

const COPY: Record<PublicLocale, SocialSurfaceCopy> = {
  uk: {
    my: "Моє",
    tabs: {
      feed: "Стрічка",
      notifications: "Події",
      bookmarks: "Закладки",
    },
    feed: {
      title: "Стрічка підписок",
      description:
        "Нові публічні записи від людей, об'єктів і тем, за якими ви стежите.",
      signIn: "Увійдіть, щоб відкрити стрічку підписок.",
      signedOutPublic: "Нижче — публічна стрічка OverGarden.",
      empty:
        "Підпишіться на профіль, живий об'єкт або тему, і нові публічні записи з'являться тут.",
      emptyTitle: "Стрічка підписок поки порожня",
      emptyAction: "Знайти журнали",
      all: "Усі",
      people: "Люди",
      objects: "Об'єкти",
      topics: "Теми",
      everyKind: "Усі типи",
      plants: "Рослини",
      animals: "Тварини",
      fromPerson: "Від автора",
      fromObject: "Від об'єкта",
      fromTopic: "За темою",
      sourceFiltersLabel: "Джерело записів",
      kindFiltersLabel: "Тип живого об'єкта",
    },
    notifications: {
      emptyTitle: "Подій поки немає",
      emptyAction: "Знайти журнали",
      unreadBadge: "Непрочитане",
      readBadge: "Прочитане",
      unreadOfGroup: "Непрочитані: {count}",
      title: "Події",
      description:
        "Що зробили інші садівники — коментарі, підписки, походження — і необов'язкові нагадування про записи.",
      signIn: "Увійдіть, щоб відкрити свої події.",
      empty:
        "Тут з'являться коментарі, підписки й запитання від інших садівників, а також нагадування про записи, якщо їх увімкнено.",
      all: "Усі",
      unread: "Непрочитані",
      comments: "Коментарі",
      follows: "Підписки",
      mentions: "Згадки",
      claims: "Походження",
      reminders: "Нагадування",
      grouped: "Групувати схожі",
      settings: "Налаштування",
      markRead: "Позначити прочитаним",
      markUnread: "Позначити непрочитаним",
      dismiss: "Прибрати",
      filtersLabel: "Тип подій",
      listLabel: "Події",
      from: "Від {actors}",
      fromSomeone: "Від іншого садівника",
      andOthers: "{actors} та ще {count}",
      reminderOrigin: "Нагадування",
      lastEntry: "Останній запис: {when}",
      never: "Ще без записів",
      addedOn: "додано {date}",
      addedAt: "додано {date} о {time}",
      write: "Записати",
      writeLabel: "Записати: {name}",
      rowAction: "{action}: {name}",
      kinds: { plant: "Рослина", animal: "Тварина" },
      outcome: {
        read: "Позначено прочитаним.",
        unread: "Позначено непрочитаним.",
        dismissed: "Прибрано зі списку.",
        failed: "Не вдалося зберегти, нічого не змінилося. Спробуйте ще раз.",
      },
      loadErrorTitle: "Не вдалося показати події",
      summaries: {
        comment_on_journal: "Новий коментар до вашого запису",
        reply_to_comment: "Нова відповідь на ваш коментар",
        profile_followed: "Новий підписник профілю",
        object_followed: "Нова підписка на вашу рослину чи тварину",
        lineage_followed:
          "Нова підписка на походження вашої рослини чи тварини",
        provenance_mention: "Вашу рослину чи тварину вказано як джерело",
        claim_decided: "Рішення щодо вашого запиту про походження",
        lineage_question: "Нове запитання про походження",
        stale_journal_prompt: "Нагадування про запис",
      },
      settingsPage: {
        title: "Налаштування подій",
        description:
          "Що з'являється на сторінці «Події». Вимкнене не показується, доки ви не ввімкнете його знову.",
        back: "До подій",
        social: "Від інших садівників",
        reminders: "Нагадування",
        options: {
          comments: "Коментарі до ваших записів",
          replies: "Відповіді на ваші коментарі",
          follows: "Підписки на вас і ваші рослини й тварини",
          mentions: "Коли вашу рослину чи тварину вказують як джерело",
          claims: "Рішення й запитання про походження",
          system: "Нагадування про записи",
        },
        reminderHint:
          "Про ваші рослини й тварини без записів за останні два тижні. Вони необов'язкові: вимкніть, якщо не потрібні.",
        save: "Зберегти",
        saved: "Налаштування збережено.",
        failed:
          "Не вдалося зберегти налаштування, збережене не змінилося. Спробуйте ще раз.",
        signIn: "Увійдіть, щоб змінити налаштування подій.",
        loadErrorTitle: "Не вдалося показати налаштування",
      },
    },
    bookmarks: {
      removedNotice: "«{name}» прибрано із закладок",
      removedNoticeUnnamed: "Прибрано із закладок",
      restoredNotice: "«{name}» повернуто до закладок",
      restoredNoticeUnnamed: "Повернуто до закладок",
      removeLabel: "Прибрати із закладок: {name}",
      failed: {
        remove: "Не вдалося прибрати, закладка лишилася. Спробуйте ще раз.",
        restore: "Не вдалося повернути до закладок. Спробуйте ще раз.",
      },
      unavailableTitle: "Більше недоступно",
      unavailable: {
        journal_entry:
          "Цей запис прибрали, або автор більше не показує його публічно.",
        lineage_object:
          "Цю рослину чи тварину автор більше не показує публічно.",
        variety: "Цієї сторінки більше немає в каталозі.",
        topic: "Цієї теми більше немає.",
      },
      emptyTitle: "Закладок поки немає",
      emptyAction: "Знайти журнали",
      title: "Закладки",
      description:
        "Записи, рослини й тварини, сорти й теми, які ви зберегли, щоб повернутися до них.",
      signIn: "Увійдіть, щоб відкрити свої закладки.",
      empty:
        "Збережіть запис, рослину чи тварину, сорт або тему — вони з'являться тут.",
      all: "Усі",
      journals: "Записи",
      objects: "Рослини й тварини",
      varieties: "Сорти",
      topics: "Теми",
      filtersLabel: "Тип закладок",
    },
    common: {
      noResultsTitle: "Нічого не збіглося",
      noResultsDescription: "Спробуйте зняти фільтр.",
      clearFilters: "Зняти фільтри",
      undo: "Повернути",
      dismissNotice: "Закрити повідомлення",
      noticeRegion: "Результат дії",
      saved: "Збережено",
      remove: "Прибрати",
      open: "Відкрити",
      itemCount: (count) =>
        `${count} ${pluralForm("uk", count, {
          one: "елемент",
          few: "елементи",
          many: "елементів",
          other: "елемента",
        })}`,
      unreadCount: (count) => `Непрочитані: ${count}`,
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
    },
    feed: {
      title: "Емисия от следвани",
      description:
        "Нови публични записи от хора, обекти и теми, които следвате.",
      signIn: "Влезте, за да отворите емисията си.",
      signedOutPublic: "По-долу е публичната емисия на OverGarden.",
      empty:
        "Последвайте профил, жив обект или тема и новите публични записи ще се появят тук.",
      emptyTitle: "Емисията от следвани е още празна",
      emptyAction: "Намерете дневници",
      all: "Всички",
      people: "Хора",
      objects: "Обекти",
      topics: "Теми",
      everyKind: "Всички типове",
      plants: "Растения",
      animals: "Животни",
      fromPerson: "От автор",
      fromObject: "От обект",
      fromTopic: "По тема",
      sourceFiltersLabel: "Източник на записите",
      kindFiltersLabel: "Тип жив обект",
    },
    notifications: {
      emptyTitle: "Още няма известия",
      emptyAction: "Разгледай дневниците",
      unreadBadge: "Непрочетено",
      readBadge: "Прочетено",
      unreadOfGroup: "Непрочетени: {count}",
      title: "Известия",
      description:
        "Какво направиха другите градинари — коментари, следвания, произход — и незадължителни напомняния за записи.",
      signIn: "Влезте, за да отворите известията си.",
      empty:
        "Тук ще се появят коментари, следвания и въпроси от други градинари, както и напомняния за записи, ако са включени.",
      all: "Всички",
      unread: "Непрочетени",
      comments: "Коментари",
      follows: "Следвания",
      mentions: "Споменавания",
      claims: "Произход",
      reminders: "Напомняния",
      grouped: "Групирай сходните",
      settings: "Настройки",
      markRead: "Маркирай като прочетено",
      markUnread: "Маркирай като непрочетено",
      dismiss: "Премахни",
      filtersLabel: "Тип известия",
      listLabel: "Известия",
      from: "От {actors}",
      fromSomeone: "От друг градинар",
      andOthers: "{actors} и още {count}",
      reminderOrigin: "Напомняне",
      lastEntry: "Последен запис: {when}",
      never: "Все още без записи",
      addedOn: "добавено {date}",
      addedAt: "добавено {date} в {time}",
      write: "Запиши",
      writeLabel: "Запиши: {name}",
      rowAction: "{action}: {name}",
      kinds: { plant: "Растение", animal: "Животно" },
      outcome: {
        read: "Маркирано като прочетено.",
        unread: "Маркирано като непрочетено.",
        dismissed: "Премахнато от списъка.",
        failed: "Не успяхме да запазим, нищо не е променено. Опитайте отново.",
      },
      loadErrorTitle: "Известията не могат да се покажат",
      summaries: {
        comment_on_journal: "Нов коментар към ваш запис",
        reply_to_comment: "Нов отговор на ваш коментар",
        profile_followed: "Нов последовател на профила",
        object_followed: "Ново следване на ваше растение или животно",
        lineage_followed:
          "Ново следване на произхода на ваше растение или животно",
        provenance_mention:
          "Ваше растение или животно е посочено като източник",
        claim_decided: "Решение по ваша заявка за произход",
        lineage_question: "Нов въпрос за произход",
        stale_journal_prompt: "Напомняне за запис",
      },
      settingsPage: {
        title: "Настройки на известията",
        description:
          "Какво се появява на страницата „Известия“. Изключеното не се показва, докато не го включите отново.",
        back: "Към известията",
        social: "От други градинари",
        reminders: "Напомняния",
        options: {
          comments: "Коментари към вашите записи",
          replies: "Отговори на вашите коментари",
          follows: "Следвания на вас и на вашите растения и животни",
          mentions: "Когато ваше растение или животно е посочено като източник",
          claims: "Решения и въпроси за произход",
          system: "Напомняния за записи",
        },
        reminderHint:
          "За вашите растения и животни без записи през последните две седмици. Не са задължителни: изключете ги, ако не ви трябват.",
        save: "Запази",
        saved: "Настройките са запазени.",
        failed:
          "Настройките не бяха запазени, запазеното не е променено. Опитайте отново.",
        signIn: "Влезте, за да промените настройките на известията.",
        loadErrorTitle: "Настройките не могат да се покажат",
      },
    },
    bookmarks: {
      removedNotice: "„{name}“ е премахнато от отметките",
      removedNoticeUnnamed: "Премахнато от отметките",
      restoredNotice: "„{name}“ е върнато в отметките",
      restoredNoticeUnnamed: "Върнато в отметките",
      removeLabel: "Премахни от отметките: {name}",
      failed: {
        remove: "Премахването не успя, отметката остава. Опитайте отново.",
        restore: "Връщането в отметките не успя. Опитайте отново.",
      },
      unavailableTitle: "Вече не е достъпно",
      unavailable: {
        journal_entry:
          "Този запис е премахнат или авторът вече не го показва публично.",
        lineage_object:
          "Авторът вече не показва това растение или животно публично.",
        variety: "Тази страница вече я няма в каталога.",
        topic: "Тази тема вече я няма.",
      },
      emptyTitle: "Още няма отметки",
      emptyAction: "Разгледай дневниците",
      title: "Отметки",
      description:
        "Записи, растения и животни, сортове и теми, които сте запазили, за да се върнете към тях.",
      signIn: "Влезте, за да отворите отметките си.",
      empty:
        "Запазете запис, растение или животно, сорт или тема — ще се появят тук.",
      all: "Всички",
      journals: "Записи",
      objects: "Растения и животни",
      varieties: "Сортове",
      topics: "Теми",
      filtersLabel: "Тип отметки",
    },
    common: {
      noResultsTitle: "Нищо не съвпадна",
      noResultsDescription: "Опитайте да махнете филтъра.",
      clearFilters: "Махни филтрите",
      undo: "Върни",
      dismissNotice: "Затвори съобщението",
      noticeRegion: "Резултат от действието",
      saved: "Запазено",
      remove: "Премахни",
      open: "Отвори",
      itemCount: (count) =>
        `${count} ${pluralForm("bg", count, {
          one: "елемент",
          other: "елемента",
        })}`,
      unreadCount: (count) => `Непрочетени: ${count}`,
      loadError: (surface) => `Неуспешно зареждане: ${surface}`,
      retry: "Опитай отново",
    },
  },
  ru: {
    my: "Моё",
    tabs: {
      feed: "Лента",
      notifications: "События",
      bookmarks: "Закладки",
    },
    feed: {
      title: "Лента подписок",
      description:
        "Новые публичные записи людей, объектов и тем, на которые вы подписаны.",
      signIn: "Войдите, чтобы открыть ленту подписок.",
      signedOutPublic: "Ниже — публичная лента OverGarden.",
      empty:
        "Подпишитесь на профиль, живой объект или тему, и новые публичные записи появятся здесь.",
      emptyTitle: "Лента подписок пока пуста",
      emptyAction: "Найти журналы",
      all: "Все",
      people: "Люди",
      objects: "Объекты",
      topics: "Темы",
      everyKind: "Все типы",
      plants: "Растения",
      animals: "Животные",
      fromPerson: "От автора",
      fromObject: "От объекта",
      fromTopic: "По теме",
      sourceFiltersLabel: "Источник записей",
      kindFiltersLabel: "Тип живого объекта",
    },
    notifications: {
      emptyTitle: "Событий пока нет",
      emptyAction: "Найти журналы",
      unreadBadge: "Непрочитанное",
      readBadge: "Прочитанное",
      unreadOfGroup: "Непрочитанные: {count}",
      title: "События",
      description:
        "Что сделали другие садоводы — комментарии, подписки, происхождение — и необязательные напоминания о записях.",
      signIn: "Войдите, чтобы открыть свои события.",
      empty:
        "Здесь появятся комментарии, подписки и вопросы от других садоводов, а также напоминания о записях, если они включены.",
      all: "Все",
      unread: "Непрочитанные",
      comments: "Комментарии",
      follows: "Подписки",
      mentions: "Упоминания",
      claims: "Происхождение",
      reminders: "Напоминания",
      grouped: "Группировать похожие",
      settings: "Настройки",
      markRead: "Отметить прочитанным",
      markUnread: "Отметить непрочитанным",
      dismiss: "Убрать",
      filtersLabel: "Тип событий",
      listLabel: "События",
      from: "От {actors}",
      fromSomeone: "От другого садовода",
      andOthers: "{actors} и ещё {count}",
      reminderOrigin: "Напоминание",
      lastEntry: "Последняя запись: {when}",
      never: "Ещё без записей",
      addedOn: "добавлено {date}",
      addedAt: "добавлено {date} в {time}",
      write: "Записать",
      writeLabel: "Записать: {name}",
      rowAction: "{action}: {name}",
      kinds: { plant: "Растение", animal: "Животное" },
      outcome: {
        read: "Отмечено прочитанным.",
        unread: "Отмечено непрочитанным.",
        dismissed: "Убрано из списка.",
        failed:
          "Не удалось сохранить, ничего не изменилось. Попробуйте ещё раз.",
      },
      loadErrorTitle: "Не удалось показать события",
      summaries: {
        comment_on_journal: "Новый комментарий к вашей записи",
        reply_to_comment: "Новый ответ на ваш комментарий",
        profile_followed: "Новый подписчик профиля",
        object_followed: "Новая подписка на ваше растение или животное",
        lineage_followed:
          "Новая подписка на происхождение вашего растения или животного",
        provenance_mention: "Ваше растение или животное указано как источник",
        claim_decided: "Решение по вашему запросу о происхождении",
        lineage_question: "Новый вопрос о происхождении",
        stale_journal_prompt: "Напоминание о записи",
      },
      settingsPage: {
        title: "Настройки событий",
        description:
          "Что появляется на странице «События». Выключенное не показывается, пока вы не включите его снова.",
        back: "К событиям",
        social: "От других садоводов",
        reminders: "Напоминания",
        options: {
          comments: "Комментарии к вашим записям",
          replies: "Ответы на ваши комментарии",
          follows: "Подписки на вас и ваши растения и животных",
          mentions: "Когда ваше растение или животное указывают как источник",
          claims: "Решения и вопросы о происхождении",
          system: "Напоминания о записях",
        },
        reminderHint:
          "О ваших растениях и животных без записей за последние две недели. Они необязательны: выключите, если не нужны.",
        save: "Сохранить",
        saved: "Настройки сохранены.",
        failed:
          "Не удалось сохранить настройки, сохранённое не изменилось. Попробуйте ещё раз.",
        signIn: "Войдите, чтобы изменить настройки событий.",
        loadErrorTitle: "Не удалось показать настройки",
      },
    },
    bookmarks: {
      removedNotice: "«{name}» убрано из закладок",
      removedNoticeUnnamed: "Убрано из закладок",
      restoredNotice: "«{name}» возвращено в закладки",
      restoredNoticeUnnamed: "Возвращено в закладки",
      removeLabel: "Убрать из закладок: {name}",
      failed: {
        remove: "Не удалось убрать, закладка осталась. Попробуйте ещё раз.",
        restore: "Не удалось вернуть в закладки. Попробуйте ещё раз.",
      },
      unavailableTitle: "Больше недоступно",
      unavailable: {
        journal_entry:
          "Эту запись убрали, или автор больше не показывает её публично.",
        lineage_object:
          "Автор больше не показывает это растение или животное публично.",
        variety: "Этой страницы больше нет в каталоге.",
        topic: "Этой темы больше нет.",
      },
      emptyTitle: "Закладок пока нет",
      emptyAction: "Найти журналы",
      title: "Закладки",
      description:
        "Записи, растения и животные, сорта и темы, которые вы сохранили, чтобы к ним вернуться.",
      signIn: "Войдите, чтобы открыть свои закладки.",
      empty:
        "Сохраните запись, растение или животное, сорт или тему — они появятся здесь.",
      all: "Все",
      journals: "Записи",
      objects: "Растения и животные",
      varieties: "Сорта",
      topics: "Темы",
      filtersLabel: "Тип закладок",
    },
    common: {
      noResultsTitle: "Ничего не совпало",
      noResultsDescription: "Попробуйте снять фильтр.",
      clearFilters: "Снять фильтры",
      undo: "Вернуть",
      dismissNotice: "Закрыть сообщение",
      noticeRegion: "Результат действия",
      saved: "Сохранено",
      remove: "Убрать",
      open: "Открыть",
      itemCount: (count) =>
        `${count} ${pluralForm("ru", count, {
          one: "элемент",
          few: "элемента",
          many: "элементов",
          other: "элемента",
        })}`,
      unreadCount: (count) => `Непрочитанные: ${count}`,
      loadError: (surface) => `Не удалось загрузить: ${surface}`,
      retry: "Попробовать снова",
    },
  },
};

export function getSocialSurfaceCopy(locale: PublicLocale) {
  return COPY[locale];
}

/** Fills `{name}` placeholders in a copy template. */
export function fillSocialTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/**
 * The word that goes with a number (`OVE-502`): "2 елементів" read wrong on
 * every shelf of two, three or four things.
 */
function pluralForm(
  locale: PublicLocale,
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  const rule = new Intl.PluralRules(locale).select(count);
  return forms[rule] ?? forms.other;
}
