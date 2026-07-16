import type { CatalogKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";

export interface OwnerLineageCopy {
  metadata: {
    claimsTitle: string;
    invitationTitle: string;
    updatesTitle: string;
  };
  common: {
    backToJournal: string;
    claims: string;
    updates: string;
    claimedObject: string;
    sourceObject: string;
    invitedSource: string;
    state: string;
    proposedBy: string;
    anotherGardener: string;
    unknownVariety: string;
    catalogKinds: Record<CatalogKind, string>;
  };
  states: {
    proposed: string;
    pending: string;
    confirmed: string;
    declined: string;
    expired: string;
  };
  claims: {
    title: string;
    waiting: string;
    publicChange: string;
    confirmedNotice: string;
    declinedNotice: string;
    empty: string;
    claimTitle: string;
    yourSourceObject: string;
    confirm: string;
    decline: string;
    writeGate: string;
  };
  invitation: {
    title: string;
    description: string;
    cardTitle: string;
    confirm: string;
    decline: string;
    guestTitle: string;
    guestDescription: string;
    signIn: string;
    unavailable: string;
    actionUnavailable: string;
    handoff: {
      preparing: string;
      errorTitle: string;
      retryDescription: string;
      retry: string;
    };
  };
  updates: {
    title: string;
    questionCount: string;
    followedCount: string;
    questionsTitle: string;
    questionsDescription: string;
    questionsEmpty: string;
    followedTitle: string;
    followedDescription: string;
    followedEmpty: string;
  };
}

const COPY = {
  uk: {
    metadata: {
      claimsTitle: "Запити щодо походження | OverGarden",
      invitationTitle: "Запрошення щодо походження | OverGarden",
      updatesTitle: "Оновлення походження | OverGarden",
    },
    common: {
      backToJournal: "Назад до журналу",
      claims: "Запити щодо походження",
      updates: "Оновлення походження",
      claimedObject: "Заявлений об'єкт",
      sourceObject: "Вихідний об'єкт",
      invitedSource: "Запрошене джерело",
      state: "Стан",
      proposedBy: "Запропоновано",
      anotherGardener: "Іншим садівником",
      unknownVariety: "Невідомий різновид",
      catalogKinds: {
        plant_variety: "Сорт рослини",
        species: "Вид",
        breed: "Порода",
      },
    },
    states: {
      proposed:
        "Запропоноване походження · ще не впливає на публічне походження",
      pending: "Очікує рішення · ще не впливає на публічне походження",
      confirmed: "Походження підтверджено",
      declined: "Походження відхилено",
      expired: "Термін запрошення минув",
    },
    claims: {
      title: "Запити щодо походження",
      waiting: "Очікують рішення: {count}",
      publicChange: "Публічна зміна: відсутня до підтвердження",
      confirmedNotice:
        "Запрошення підтверджено. Тепер це походження може враховуватися згідно зі збереженою політикою видимості.",
      declinedNotice:
        "Запрошення відхилено. Воно не впливає на публічне походження.",
      empty: "На вас не очікують запити щодо походження.",
      claimTitle: "Заявлене походження {subject} від {source}",
      yourSourceObject: "Ваш вихідний об'єкт",
      confirm: "Підтвердити походження",
      decline: "Відхилити",
      writeGate:
        "Відкрийте персональне запрошення, щоб відповісти на запит щодо походження.",
    },
    invitation: {
      title: "Запрошення щодо походження",
      description:
        "Перегляньте приватне запрошення щодо походження. Ніщо не вплине на публічне відображення походження, доки ви цього не підтвердите.",
      cardTitle: "Підтвердьте джерело походження",
      confirm: "Прийняти й підтвердити",
      decline: "Відхилити",
      guestTitle: "Увійдіть, щоб переглянути приватне запрошення",
      guestDescription:
        "Деталі запрошення залишаються прихованими до входу. Ніщо не приєднається до публічного графа походження без вашого явного підтвердження.",
      signIn: "Увійти й переглянути запрошення",
      unavailable: "Це запрошення недоступне, прострочене або вже опрацьоване.",
      actionUnavailable: "Запрошення щодо походження недоступне.",
      handoff: {
        preparing: "Готуємо приватне запрошення...",
        errorTitle: "Не вдалося підготувати запрошення",
        retryDescription:
          "Запрошення все ще доступне на цьому пристрої. Спробуйте ще раз безпечно передати його.",
        retry: "Спробувати ще раз",
      },
    },
    updates: {
      title: "Оновлення походження",
      questionCount: "Питання: {count}",
      followedCount: "Відстежуються: {count}",
      questionsTitle: "Питання для вас",
      questionsDescription:
        "Надіслані лише учасниками з підтвердженим зв'язком походження.",
      questionsEmpty: "Для вас немає нових питань про походження.",
      followedTitle: "Відстежувані вузли походження",
      followedDescription:
        "Тут показано лише вузли, які досі мають активне публічне представлення.",
      followedEmpty: "Ви ще не стежите за вузлами походження.",
    },
  },
  bg: {
    metadata: {
      claimsTitle: "Заявки за произход | OverGarden",
      invitationTitle: "Покана за произход | OverGarden",
      updatesTitle: "Обновления за произхода | OverGarden",
    },
    common: {
      backToJournal: "Назад към дневника",
      claims: "Заявки за произход",
      updates: "Обновления за произхода",
      claimedObject: "Заявен обект",
      sourceObject: "Обект източник",
      invitedSource: "Поканен източник",
      state: "Състояние",
      proposedBy: "Предложено от",
      anotherGardener: "Друг градинар",
      unknownVariety: "Неизвестна разновидност",
      catalogKinds: {
        plant_variety: "Сорт растение",
        species: "Вид",
        breed: "Порода",
      },
    },
    states: {
      proposed: "Предложен произход · все още няма публичен принос",
      pending: "Очаква решение · все още няма публичен принос",
      confirmed: "Произходът е потвърден",
      declined: "Произходът е отказан",
      expired: "Срокът на поканата е изтекъл",
    },
    claims: {
      title: "Заявки за произход",
      waiting: "Очакват решение: {count}",
      publicChange: "Публична промяна: няма преди потвърждение",
      confirmedNotice:
        "Поканата е потвърдена. Този произход вече може да участва според записаната политика за видимост.",
      declinedNotice:
        "Поканата е отказана. Тя не участва в публичния произход.",
      empty: "Няма заявки за произход, които очакват вашето решение.",
      claimTitle: "Заявено е, че {subject} произхожда от {source}",
      yourSourceObject: "Вашият обект източник",
      confirm: "Потвърждаване на произхода",
      decline: "Отказване",
      writeGate:
        "Отворете личната си покана, за да отговорите на заявката за произход.",
    },
    invitation: {
      title: "Покана за произход",
      description:
        "Прегледайте лична покана за произход. Нищо не участва в публичното показване на произхода, докато не го потвърдите.",
      cardTitle: "Потвърдете източник на произход",
      confirm: "Приемане и потвърждаване",
      decline: "Отказване",
      guestTitle: "Влезте, за да прегледате личната покана",
      guestDescription:
        "Подробностите остават скрити до влизане. Нищо не се добавя към публичния граф на произхода без изричното ви потвърждение.",
      signIn: "Влизане и преглед на поканата",
      unavailable: "Тази покана е недостъпна, изтекла или вече обработена.",
      actionUnavailable: "Поканата за произход е недостъпна.",
      handoff: {
        preparing: "Подготвяме личната покана...",
        errorTitle: "Не успяхме да подготвим поканата",
        retryDescription:
          "Поканата все още е налична на това устройство. Опитайте отново сигурното предаване.",
        retry: "Нов опит",
      },
    },
    updates: {
      title: "Обновления за произхода",
      questionCount: "Въпроси: {count}",
      followedCount: "Следвани: {count}",
      questionsTitle: "Въпроси към вас",
      questionsDescription:
        "Доставят се само от участници с потвърдена връзка на произход.",
      questionsEmpty: "Няма нови въпроси за произход към вас.",
      followedTitle: "Следвани възли на произход",
      followedDescription:
        "Тук се показват само възли, които все още имат активно публично представяне.",
      followedEmpty: "Все още не следвате възли на произход.",
    },
  },
  ru: {
    metadata: {
      claimsTitle: "Запросы о происхождении | OverGarden",
      invitationTitle: "Приглашение подтвердить происхождение | OverGarden",
      updatesTitle: "Обновления происхождения | OverGarden",
    },
    common: {
      backToJournal: "Назад к журналу",
      claims: "Запросы о происхождении",
      updates: "Обновления происхождения",
      claimedObject: "Заявленный объект",
      sourceObject: "Исходный объект",
      invitedSource: "Приглашённый источник",
      state: "Состояние",
      proposedBy: "Предложено",
      anotherGardener: "Другим садоводом",
      unknownVariety: "Неизвестная разновидность",
      catalogKinds: {
        plant_variety: "Сорт растения",
        species: "Вид",
        breed: "Порода",
      },
    },
    states: {
      proposed:
        "Предложенное происхождение · пока не влияет на публичное происхождение",
      pending: "Ожидает решения · пока не влияет на публичное происхождение",
      confirmed: "Происхождение подтверждено",
      declined: "Происхождение отклонено",
      expired: "Срок приглашения истёк",
    },
    claims: {
      title: "Запросы о происхождении",
      waiting: "Ожидают решения: {count}",
      publicChange: "Публичное изменение: отсутствует до подтверждения",
      confirmedNotice:
        "Приглашение подтверждено. Теперь это происхождение может учитываться согласно сохранённой политике видимости.",
      declinedNotice:
        "Приглашение отклонено. Оно не влияет на публичное происхождение.",
      empty: "Нет запросов о происхождении, ожидающих вашего решения.",
      claimTitle: "Заявлено происхождение {subject} от {source}",
      yourSourceObject: "Ваш исходный объект",
      confirm: "Подтвердить происхождение",
      decline: "Отклонить",
      writeGate:
        "Откройте личное приглашение, чтобы ответить на запрос о происхождении.",
    },
    invitation: {
      title: "Приглашение подтвердить происхождение",
      description:
        "Просмотрите личное приглашение о происхождении. Ничего не повлияет на публичное отображение происхождения, пока вы это не подтвердите.",
      cardTitle: "Подтвердите источник происхождения",
      confirm: "Принять и подтвердить",
      decline: "Отклонить",
      guestTitle: "Войдите, чтобы просмотреть личное приглашение",
      guestDescription:
        "Подробности приглашения скрыты до входа. Ничего не добавится в публичный граф происхождения без вашего явного подтверждения.",
      signIn: "Войти и просмотреть приглашение",
      unavailable: "Это приглашение недоступно, просрочено или уже обработано.",
      actionUnavailable: "Приглашение о происхождении недоступно.",
      handoff: {
        preparing: "Подготавливаем личное приглашение...",
        errorTitle: "Не удалось подготовить приглашение",
        retryDescription:
          "Приглашение всё ещё доступно на этом устройстве. Повторите безопасную передачу.",
        retry: "Попробовать снова",
      },
    },
    updates: {
      title: "Обновления происхождения",
      questionCount: "Вопросы: {count}",
      followedCount: "Отслеживаются: {count}",
      questionsTitle: "Вопросы для вас",
      questionsDescription:
        "Доставляются только от участников с подтверждённой связью происхождения.",
      questionsEmpty: "Для вас нет новых вопросов о происхождении.",
      followedTitle: "Отслеживаемые узлы происхождения",
      followedDescription:
        "Здесь показаны только узлы, у которых всё ещё есть активное публичное представление.",
      followedEmpty: "Вы ещё не отслеживаете узлы происхождения.",
    },
  },
} satisfies Record<InterfaceLocale, OwnerLineageCopy>;

const DATE_LOCALE: Record<InterfaceLocale, string> = {
  uk: "uk-UA",
  bg: "bg-BG",
  ru: "ru-RU",
};

export function getOwnerLineageCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

export function formatOwnerLineageTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function formatOwnerLineageDate(
  locale: InterfaceLocale,
  value: Date | string,
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getOwnerLineageCatalogKindLabel(
  locale: InterfaceLocale,
  kind: CatalogKind | null,
) {
  return kind ? COPY[locale].common.catalogKinds[kind] : null;
}
