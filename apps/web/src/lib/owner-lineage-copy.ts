import type { CatalogKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The words of the three lineage tasks (`OVE-495`): questions put to the
 * reader, claims that their object is another's source, and an invitation to
 * be named as one.
 *
 * Every consequence here is what the backend does, not what a reader might
 * hope it does: a confirmed claim is shown on the public passport of the
 * object that came from the other — public lineage walks ancestry, so never
 * on the source's own — and only when both objects have public entries
 * (`public-lineage-repository`); an invitation
 * never makes anything public (public lineage lists object-to-object links
 * only), no answer can be changed afterwards (there is no mutation that
 * would), and neither answer moves an object between gardens.
 */
export interface OwnerLineageCopy {
  metadata: {
    claimsTitle: string;
    invitationTitle: string;
    questionsTitle: string;
  };
  nav: {
    label: string;
    questions: string;
    claims: string;
    back: string;
  };
  common: {
    gardenerWithoutProfile: string;
    claimedObject: string;
    yourObject: string;
    status: string;
    unknownVariety: string;
    catalogKinds: Record<CatalogKind, string>;
    cancel: string;
  };
  claims: {
    title: string;
    description: string;
    waiting: string;
    empty: string;
    /** `{subject}` is theirs, `{source}` is the reader's. */
    cardTitle: string;
    claimant: string;
    pending: string;
    consequencesTitle: string;
    ifConfirm: string;
    ifDecline: string;
    unchanged: string;
    confirm: string;
    decline: string;
    confirmDialogTitle: string;
    confirmDialogBody: string;
    confirmDialogAction: string;
    declineDialogTitle: string;
    declineDialogBody: string;
    declineDialogAction: string;
    outcome: {
      confirmedTitle: string;
      confirmedBody: string;
      declinedTitle: string;
      declinedBody: string;
      staleTitle: string;
      staleConfirmed: string;
      staleDeclined: string;
      staleGone: string;
    };
  };
  questions: {
    title: string;
    description: string;
    count: string;
    empty: string;
    cardTitle: string;
    asker: string;
    /** The reader's object is the source: `{theirs}` came from `{yours}`. */
    relationFromYours: string;
    /** The reader's object came from the asker's. */
    relationFromTheirs: string;
    answer: string;
    answerHint: string;
    followedTitle: string;
    followedDescription: string;
    followedEmpty: string;
    followedOwner: string;
    followedSince: string;
  };
  invitation: {
    title: string;
    description: string;
    guest: {
      title: string;
      description: string;
      signIn: string;
    };
    ready: {
      title: string;
      inviter: string;
      recordedAs: string;
      object: string;
      consequencesTitle: string;
      ifConfirm: string;
      ifDecline: string;
      unchanged: string;
      confirm: string;
      decline: string;
      confirmDialogTitle: string;
      confirmDialogBody: string;
      confirmDialogAction: string;
      declineDialogTitle: string;
      declineDialogBody: string;
      declineDialogAction: string;
    };
    states: {
      expiredTitle: string;
      expiredBody: string;
      invalidTitle: string;
      invalidBody: string;
      withdrawnTitle: string;
      withdrawnBody: string;
      confirmedByYouTitle: string;
      confirmedByYouBody: string;
      declinedByYouTitle: string;
      declinedByYouBody: string;
      answeredByOtherTitle: string;
      answeredByOtherBody: string;
      ownTitle: string;
      ownBody: string;
      ownLink: string;
      notSaved: string;
    };
    handoff: {
      preparing: string;
      missingTitle: string;
      missingBody: string;
      errorTitle: string;
      retryDescription: string;
      retry: string;
    };
  };
}

const COPY = {
  uk: {
    metadata: {
      claimsTitle: "Заявки на походження | OverGarden",
      invitationTitle: "Запрошення підтвердити походження | OverGarden",
      questionsTitle: "Запитання про походження | OverGarden",
    },
    nav: {
      label: "Походження",
      questions: "Запитання",
      claims: "Заявки",
      back: "До мого саду",
    },
    common: {
      gardenerWithoutProfile: "Садівник без публічного профілю",
      claimedObject: "Заявлений об'єкт",
      yourObject: "Ваш об'єкт",
      status: "Стан",
      unknownVariety: "Невідомий різновид",
      catalogKinds: {
        plant_variety: "Сорт рослини",
        species: "Вид",
        breed: "Порода",
      },
      cancel: "Скасувати",
    },
    claims: {
      title: "Заявки на походження",
      description:
        "Тут садівники кажуть, що їхня рослина чи тварина походить від вашої. Поки ви не відповісте, заявку бачите лише ви двоє.",
      waiting: "Чекають на відповідь: {count}",
      empty:
        "Заявок немає. Коли інший садівник пов'яже свій об'єкт із вашим, заявка з'явиться тут.",
      cardTitle: "«{subject}» походить від вашого «{source}»",
      claimant: "Заявник",
      pending: "Чекає на вашу відповідь",
      consequencesTitle: "Що зміниться",
      ifConfirm:
        "Підтвердити: коли в обох об'єктів є публічні записи, публічний паспорт заявленого об'єкта покаже, що він походить від вашого, а ви із заявником зможете стежити за об'єктами одне одного й ставити запитання — без контактних даних.",
      ifDecline:
        "Відхилити: зв'язок ніде не з'явиться, а заявник побачить у своєму записі походження, що заявку відхилено.",
      unchanged:
        "Обидва об'єкти та їхні записи залишаються у своїх власників. Це слово двох садівників, а не генетичний аналіз. Змінити відповідь потім не можна.",
      confirm: "Підтвердити походження",
      decline: "Відхилити заявку",
      confirmDialogTitle:
        "Підтвердити, що «{subject}» походить від вашого «{source}»?",
      confirmDialogBody:
        "Коли в обох об'єктів є публічні записи, паспорт заявленого об'єкта покаже, що він походить від вашого. Об'єкти залишаються у своїх власників. Змінити відповідь потім не можна.",
      confirmDialogAction: "Підтвердити",
      declineDialogTitle: "Відхилити заявку щодо «{subject}»?",
      declineDialogBody:
        "Зв'язок ніде не з'явиться, а заявник побачить, що заявку відхилено. Змінити відповідь потім не можна.",
      declineDialogAction: "Відхилити",
      outcome: {
        confirmedTitle: "Походження підтверджено",
        confirmedBody:
          "«{subject}» походить від вашого «{source}». Коли в обох об'єктів є публічні записи, це видно на публічному паспорті «{subject}».",
        declinedTitle: "Заявку відхилено",
        declinedBody:
          "Зв'язок між «{subject}» і вашим «{source}» ніде не показується.",
        staleTitle: "Відповідь не збережено",
        staleConfirmed:
          "Ви вже підтвердили цю заявку раніше, тож нічого не змінилося.",
        staleDeclined:
          "Ви вже відхилили цю заявку раніше, тож нічого не змінилося.",
        staleGone: "Цієї заявки більше немає. Нічого не змінилося.",
      },
    },
    questions: {
      title: "Запитання про походження",
      description:
        "Садівник, з яким ви підтвердили походження, може спитати про ваш об'єкт. Запитання приходить без контактних даних, а приватної відповіді немає: відповісти можна записом про цей об'єкт.",
      count: "Запитань: {count}",
      empty:
        "Запитань немає. Спитати про ваш об'єкт може лише садівник, з яким ви підтвердили походження.",
      cardTitle: "Про ваш «{object}»",
      asker: "Питає",
      relationFromYours:
        "Через зв'язок: «{theirs}» походить від вашого «{yours}»",
      relationFromTheirs:
        "Через зв'язок: ваш «{yours}» походить від «{theirs}»",
      answer: "Відповісти записом про «{object}»",
      answerHint:
        "Хто стежить за цим об'єктом, побачить публічний запис про нього у своїй стрічці.",
      followedTitle: "За чим ви стежите",
      followedDescription:
        "Об'єкти з підтвердженого походження, за якими ви стежите. Їхні публічні записи з'являються у вашій стрічці.",
      followedEmpty:
        "Ви ще ні за чим не стежите. Стежити можна з публічного паспорта об'єкта, пов'язаного з вашим.",
      followedOwner: "Доглядальник",
      followedSince: "Стежите з {date}",
    },
    invitation: {
      title: "Запрошення підтвердити походження",
      description:
        "Садівник записав вас як джерело свого об'єкта й надіслав це посилання. Лише ви вирішуєте, чи це правда.",
      guest: {
        title: "Увійдіть, щоб відповісти",
        description:
          "Хто надіслав запрошення і про який об'єкт, видно лише після входу. Посилання збережене на цьому пристрої на 30 хвилин: після входу ви повернетеся сюди.",
        signIn: "Увійти й переглянути запрошення",
      },
      ready: {
        title: "Чи походить «{subject}» від вас?",
        inviter: "Запрошує",
        recordedAs: "Як вас записано",
        object: "Об'єкт",
        consequencesTitle: "Що зміниться",
        ifConfirm:
          "Підтвердити: запис походження садівника стане підтвердженим, і в ньому збережеться, що відповів ваш акаунт.",
        ifDecline:
          "Відхилити: садівник побачить у своєму записі, що запрошення відхилено.",
        unchanged:
          "Публічно не з'явиться нічого ні в тому, ні в іншому разі: запрошення не додає зв'язків на публічні паспорти. Ваші об'єкти не змінюються, і нічого не переходить до вашого саду. Змінити відповідь потім не можна, а посилання перестане діяти.",
        confirm: "Так, це я",
        decline: "Ні, це не я",
        confirmDialogTitle: "Підтвердити, що «{subject}» походить від вас?",
        confirmDialogBody:
          "Запис садівника стане підтвердженим. Публічно нічого не з'явиться. Змінити відповідь потім не можна.",
        confirmDialogAction: "Підтвердити",
        declineDialogTitle: "Відхилити запрошення?",
        declineDialogBody:
          "Садівник побачить, що запрошення відхилено. Змінити відповідь потім не можна.",
        declineDialogAction: "Відхилити",
      },
      states: {
        expiredTitle: "Термін дії запрошення минув",
        expiredBody:
          "Посилання діє 30 днів від створення. Попросіть садівника, який його надіслав, створити нове.",
        invalidTitle: "Посилання не вдалося перевірити",
        invalidBody:
          "Можливо, його скопійовано не повністю. Відкрийте його ще раз із повідомлення, яке ви отримали, або попросіть нове.",
        withdrawnTitle: "Цього запрошення більше немає",
        withdrawnBody:
          "Запис, на який воно вказує, видалено. Нічого не змінилося.",
        confirmedByYouTitle: "Ви підтвердили походження",
        confirmedByYouBody:
          "Запис садівника підтверджено. Публічно нічого не з'явилося, і ваші об'єкти не змінилися.",
        declinedByYouTitle: "Ви відхилили запрошення",
        declinedByYouBody:
          "Садівник бачить у своєму записі, що запрошення відхилено. Більше нічого не змінилося.",
        answeredByOtherTitle: "На це запрошення вже відповіли",
        answeredByOtherBody:
          "Відповів інший акаунт, тож відповісти ще раз не можна. Якщо запрошення надсилали вам, повідомте садівника, який його надіслав.",
        ownTitle: "Це ваше запрошення",
        ownBody:
          "Надішліть посилання людині, яку ви записали як джерело: відповісти на нього може лише вона.",
        ownLink: "Відкрити походження «{subject}»",
        notSaved: "Відповідь не збережено.",
      },
      handoff: {
        preparing: "Відкриваємо запрошення…",
        missingTitle: "Відкрийте посилання із запрошення",
        missingBody:
          "Ця сторінка працює лише з посиланням, яке вам надіслали. Відкрийте його ще раз із повідомлення.",
        errorTitle: "Не вдалося відкрити запрошення",
        retryDescription:
          "Сервер не відповів. Посилання ще на цьому пристрої — спробуйте ще раз.",
        retry: "Спробувати ще раз",
      },
    },
  },
  bg: {
    metadata: {
      claimsTitle: "Заявки за произход | OverGarden",
      invitationTitle: "Покана за потвърждаване на произход | OverGarden",
      questionsTitle: "Въпроси за произхода | OverGarden",
    },
    nav: {
      label: "Произход",
      questions: "Въпроси",
      claims: "Заявки",
      back: "Към моята градина",
    },
    common: {
      gardenerWithoutProfile: "Градинар без публичен профил",
      claimedObject: "Заявен обект",
      yourObject: "Вашият обект",
      status: "Състояние",
      unknownVariety: "Неизвестна разновидност",
      catalogKinds: {
        plant_variety: "Сорт растение",
        species: "Вид",
        breed: "Порода",
      },
      cancel: "Отказ",
    },
    claims: {
      title: "Заявки за произход",
      description:
        "Тук градинари казват, че тяхно растение или животно произхожда от ваше. Докато не отговорите, заявката виждате само вие двамата.",
      waiting: "Чакат отговор: {count}",
      empty:
        "Няма заявки. Когато друг градинар свърже свой обект с ваш, заявката ще се появи тук.",
      cardTitle: "„{subject}“ произхожда от вашия „{source}“",
      claimant: "Заявител",
      pending: "Чака вашия отговор",
      consequencesTitle: "Какво ще се промени",
      ifConfirm:
        "Потвърждаване: когато и двата обекта имат публични записи, публичният паспорт на заявения обект ще показва, че произхожда от вашия, а вие и заявителят ще можете да следите обектите си един на друг и да си задавате въпроси — без данни за контакт.",
      ifDecline:
        "Отказ: връзката няма да се появи никъде, а заявителят ще види в записа си за произход, че заявката е отказана.",
      unchanged:
        "И двата обекта и записите им остават при собствениците си. Това е думата на двама градинари, а не генетичен анализ. Отговорът не може да се промени после.",
      confirm: "Потвърждаване на произхода",
      decline: "Отказване на заявката",
      confirmDialogTitle:
        "Да се потвърди ли, че „{subject}“ произхожда от вашия „{source}“?",
      confirmDialogBody:
        "Когато и двата обекта имат публични записи, паспортът на заявения обект ще показва, че произхожда от вашия. Обектите остават при собствениците си. Отговорът не може да се промени после.",
      confirmDialogAction: "Потвърждаване",
      declineDialogTitle: "Да се откаже ли заявката за „{subject}“?",
      declineDialogBody:
        "Връзката няма да се появи никъде, а заявителят ще види, че заявката е отказана. Отговорът не може да се промени после.",
      declineDialogAction: "Отказване",
      outcome: {
        confirmedTitle: "Произходът е потвърден",
        confirmedBody:
          "„{subject}“ произхожда от вашия „{source}“. Когато и двата обекта имат публични записи, това се вижда в публичния паспорт на „{subject}“.",
        declinedTitle: "Заявката е отказана",
        declinedBody:
          "Връзката между „{subject}“ и вашия „{source}“ не се показва никъде.",
        staleTitle: "Отговорът не е запазен",
        staleConfirmed:
          "Вече сте потвърдили тази заявка, затова нищо не се промени.",
        staleDeclined:
          "Вече сте отказали тази заявка, затова нищо не се промени.",
        staleGone: "Тази заявка вече я няма. Нищо не се промени.",
      },
    },
    questions: {
      title: "Въпроси за произхода",
      description:
        "Градинар, с когото сте потвърдили произход, може да попита за вашия обект. Въпросът идва без данни за контакт, а личен отговор няма: можете да отговорите със запис за този обект.",
      count: "Въпроси: {count}",
      empty:
        "Няма въпроси. За вашия обект може да пита само градинар, с когото сте потвърдили произход.",
      cardTitle: "За вашия „{object}“",
      asker: "Пита",
      relationFromYours:
        "Чрез връзката: „{theirs}“ произхожда от вашия „{yours}“",
      relationFromTheirs:
        "Чрез връзката: вашият „{yours}“ произхожда от „{theirs}“",
      answer: "Отговор със запис за „{object}“",
      answerHint:
        "Който следи този обект, ще види публичен запис за него в своя поток.",
      followedTitle: "Какво следите",
      followedDescription:
        "Обекти от потвърден произход, които следите. Публичните им записи се появяват във вашия поток.",
      followedEmpty:
        "Още не следите нищо. Можете да следите от публичния паспорт на обект, свързан с ваш.",
      followedOwner: "Грижи се",
      followedSince: "Следите от {date}",
    },
    invitation: {
      title: "Покана за потвърждаване на произход",
      description:
        "Градинар е записал вас като източник на свой обект и ви е изпратил тази връзка. Само вие решавате дали е вярно.",
      guest: {
        title: "Влезте, за да отговорите",
        description:
          "Кой е изпратил поканата и за кой обект се вижда само след влизане. Връзката е запазена на това устройство за 30 минути: след влизане ще се върнете тук.",
        signIn: "Влизане и преглед на поканата",
      },
      ready: {
        title: "Произхожда ли „{subject}“ от вас?",
        inviter: "Кани ви",
        recordedAs: "Как сте записани",
        object: "Обект",
        consequencesTitle: "Какво ще се промени",
        ifConfirm:
          "Потвърждаване: записът за произход на градинаря ще стане потвърден и в него ще се запази, че е отговорил вашият акаунт.",
        ifDecline:
          "Отказ: градинарят ще види в записа си, че поканата е отказана.",
        unchanged:
          "Публично няма да се появи нищо и в двата случая: поканата не добавя връзки в публичните паспорти. Вашите обекти не се променят и нищо не преминава във вашата градина. Отговорът не може да се промени после, а връзката спира да действа.",
        confirm: "Да, това съм аз",
        decline: "Не, не съм аз",
        confirmDialogTitle:
          "Да се потвърди ли, че „{subject}“ произхожда от вас?",
        confirmDialogBody:
          "Записът на градинаря ще стане потвърден. Публично няма да се появи нищо. Отговорът не може да се промени после.",
        confirmDialogAction: "Потвърждаване",
        declineDialogTitle: "Да се откаже ли поканата?",
        declineDialogBody:
          "Градинарят ще види, че поканата е отказана. Отговорът не може да се промени после.",
        declineDialogAction: "Отказване",
      },
      states: {
        expiredTitle: "Срокът на поканата е изтекъл",
        expiredBody:
          "Връзката важи 30 дни от създаването си. Помолете градинаря, който я е изпратил, да създаде нова.",
        invalidTitle: "Връзката не можа да бъде проверена",
        invalidBody:
          "Може би е копирана непълно. Отворете я отново от съобщението, което сте получили, или поискайте нова.",
        withdrawnTitle: "Тази покана вече я няма",
        withdrawnBody: "Записът, към който сочи, е изтрит. Нищо не се промени.",
        confirmedByYouTitle: "Потвърдихте произхода",
        confirmedByYouBody:
          "Записът на градинаря е потвърден. Публично не се появи нищо и вашите обекти не се промениха.",
        declinedByYouTitle: "Отказахте поканата",
        declinedByYouBody:
          "Градинарят вижда в записа си, че поканата е отказана. Нищо друго не се промени.",
        answeredByOtherTitle: "На тази покана вече е отговорено",
        answeredByOtherBody:
          "Отговорил е друг акаунт, затова не може да се отговори отново. Ако поканата е била за вас, кажете на градинаря, който я е изпратил.",
        ownTitle: "Това е вашата покана",
        ownBody:
          "Изпратете връзката на човека, когото сте записали като източник: само той може да отговори.",
        ownLink: "Към произхода на „{subject}“",
        notSaved: "Отговорът не е запазен.",
      },
      handoff: {
        preparing: "Отваряме поканата…",
        missingTitle: "Отворете връзката от поканата",
        missingBody:
          "Тази страница работи само с връзката, която сте получили. Отворете я отново от съобщението.",
        errorTitle: "Поканата не можа да се отвори",
        retryDescription:
          "Сървърът не отговори. Връзката още е на това устройство — опитайте отново.",
        retry: "Нов опит",
      },
    },
  },
  ru: {
    metadata: {
      claimsTitle: "Заявки о происхождении | OverGarden",
      invitationTitle: "Приглашение подтвердить происхождение | OverGarden",
      questionsTitle: "Вопросы о происхождении | OverGarden",
    },
    nav: {
      label: "Происхождение",
      questions: "Вопросы",
      claims: "Заявки",
      back: "К моему саду",
    },
    common: {
      gardenerWithoutProfile: "Садовод без публичного профиля",
      claimedObject: "Заявленный объект",
      yourObject: "Ваш объект",
      status: "Состояние",
      unknownVariety: "Неизвестная разновидность",
      catalogKinds: {
        plant_variety: "Сорт растения",
        species: "Вид",
        breed: "Порода",
      },
      cancel: "Отмена",
    },
    claims: {
      title: "Заявки о происхождении",
      description:
        "Здесь садоводы говорят, что их растение или животное происходит от вашего. Пока вы не ответите, заявку видите только вы двое.",
      waiting: "Ждут ответа: {count}",
      empty:
        "Заявок нет. Когда другой садовод свяжет свой объект с вашим, заявка появится здесь.",
      cardTitle: "«{subject}» происходит от вашего «{source}»",
      claimant: "Заявитель",
      pending: "Ждёт вашего ответа",
      consequencesTitle: "Что изменится",
      ifConfirm:
        "Подтвердить: когда у обоих объектов есть публичные записи, публичный паспорт заявленного объекта покажет, что он происходит от вашего, а вы и заявитель сможете следить за объектами друг друга и задавать вопросы — без контактных данных.",
      ifDecline:
        "Отклонить: связь нигде не появится, а заявитель увидит в своей записи о происхождении, что заявка отклонена.",
      unchanged:
        "Оба объекта и их записи остаются у своих владельцев. Это слово двух садоводов, а не генетический анализ. Изменить ответ потом нельзя.",
      confirm: "Подтвердить происхождение",
      decline: "Отклонить заявку",
      confirmDialogTitle:
        "Подтвердить, что «{subject}» происходит от вашего «{source}»?",
      confirmDialogBody:
        "Когда у обоих объектов есть публичные записи, паспорт заявленного объекта покажет, что он происходит от вашего. Объекты остаются у своих владельцев. Изменить ответ потом нельзя.",
      confirmDialogAction: "Подтвердить",
      declineDialogTitle: "Отклонить заявку о «{subject}»?",
      declineDialogBody:
        "Связь нигде не появится, а заявитель увидит, что заявка отклонена. Изменить ответ потом нельзя.",
      declineDialogAction: "Отклонить",
      outcome: {
        confirmedTitle: "Происхождение подтверждено",
        confirmedBody:
          "«{subject}» происходит от вашего «{source}». Когда у обоих объектов есть публичные записи, это видно в публичном паспорте «{subject}».",
        declinedTitle: "Заявка отклонена",
        declinedBody:
          "Связь между «{subject}» и вашим «{source}» нигде не показывается.",
        staleTitle: "Ответ не сохранён",
        staleConfirmed:
          "Вы уже подтвердили эту заявку раньше, поэтому ничего не изменилось.",
        staleDeclined:
          "Вы уже отклонили эту заявку раньше, поэтому ничего не изменилось.",
        staleGone: "Этой заявки больше нет. Ничего не изменилось.",
      },
    },
    questions: {
      title: "Вопросы о происхождении",
      description:
        "Садовод, с которым вы подтвердили происхождение, может спросить о вашем объекте. Вопрос приходит без контактных данных, а личного ответа нет: ответить можно записью об этом объекте.",
      count: "Вопросов: {count}",
      empty:
        "Вопросов нет. Спросить о вашем объекте может только садовод, с которым вы подтвердили происхождение.",
      cardTitle: "О вашем «{object}»",
      asker: "Спрашивает",
      relationFromYours:
        "Через связь: «{theirs}» происходит от вашего «{yours}»",
      relationFromTheirs: "Через связь: ваш «{yours}» происходит от «{theirs}»",
      answer: "Ответить записью о «{object}»",
      answerHint:
        "Кто следит за этим объектом, увидит публичную запись о нём в своей ленте.",
      followedTitle: "За чем вы следите",
      followedDescription:
        "Объекты из подтверждённого происхождения, за которыми вы следите. Их публичные записи появляются в вашей ленте.",
      followedEmpty:
        "Вы ещё ни за чем не следите. Следить можно с публичного паспорта объекта, связанного с вашим.",
      followedOwner: "Ухаживает",
      followedSince: "Следите с {date}",
    },
    invitation: {
      title: "Приглашение подтвердить происхождение",
      description:
        "Садовод записал вас как источник своего объекта и прислал эту ссылку. Только вы решаете, правда ли это.",
      guest: {
        title: "Войдите, чтобы ответить",
        description:
          "Кто прислал приглашение и о каком объекте, видно только после входа. Ссылка сохранена на этом устройстве на 30 минут: после входа вы вернётесь сюда.",
        signIn: "Войти и посмотреть приглашение",
      },
      ready: {
        title: "Происходит ли «{subject}» от вас?",
        inviter: "Приглашает",
        recordedAs: "Как вас записали",
        object: "Объект",
        consequencesTitle: "Что изменится",
        ifConfirm:
          "Подтвердить: запись о происхождении у садовода станет подтверждённой, и в ней сохранится, что ответил ваш аккаунт.",
        ifDecline:
          "Отклонить: садовод увидит в своей записи, что приглашение отклонено.",
        unchanged:
          "Публично не появится ничего ни в том, ни в другом случае: приглашение не добавляет связей в публичные паспорта. Ваши объекты не меняются, и ничего не переходит в ваш сад. Изменить ответ потом нельзя, а ссылка перестанет действовать.",
        confirm: "Да, это я",
        decline: "Нет, это не я",
        confirmDialogTitle: "Подтвердить, что «{subject}» происходит от вас?",
        confirmDialogBody:
          "Запись садовода станет подтверждённой. Публично ничего не появится. Изменить ответ потом нельзя.",
        confirmDialogAction: "Подтвердить",
        declineDialogTitle: "Отклонить приглашение?",
        declineDialogBody:
          "Садовод увидит, что приглашение отклонено. Изменить ответ потом нельзя.",
        declineDialogAction: "Отклонить",
      },
      states: {
        expiredTitle: "Срок приглашения истёк",
        expiredBody:
          "Ссылка действует 30 дней с момента создания. Попросите садовода, который её прислал, создать новую.",
        invalidTitle: "Ссылку не удалось проверить",
        invalidBody:
          "Возможно, её скопировали не полностью. Откройте её ещё раз из сообщения, которое вы получили, или попросите новую.",
        withdrawnTitle: "Этого приглашения больше нет",
        withdrawnBody:
          "Запись, на которую оно указывает, удалена. Ничего не изменилось.",
        confirmedByYouTitle: "Вы подтвердили происхождение",
        confirmedByYouBody:
          "Запись садовода подтверждена. Публично ничего не появилось, и ваши объекты не изменились.",
        declinedByYouTitle: "Вы отклонили приглашение",
        declinedByYouBody:
          "Садовод видит в своей записи, что приглашение отклонено. Больше ничего не изменилось.",
        answeredByOtherTitle: "На это приглашение уже ответили",
        answeredByOtherBody:
          "Ответил другой аккаунт, поэтому ответить ещё раз нельзя. Если приглашение присылали вам, сообщите садоводу, который его прислал.",
        ownTitle: "Это ваше приглашение",
        ownBody:
          "Отправьте ссылку человеку, которого вы записали как источник: ответить на неё может только он.",
        ownLink: "Открыть происхождение «{subject}»",
        notSaved: "Ответ не сохранён.",
      },
      handoff: {
        preparing: "Открываем приглашение…",
        missingTitle: "Откройте ссылку из приглашения",
        missingBody:
          "Эта страница работает только со ссылкой, которую вам прислали. Откройте её ещё раз из сообщения.",
        errorTitle: "Не удалось открыть приглашение",
        retryDescription:
          "Сервер не ответил. Ссылка ещё на этом устройстве — попробуйте снова.",
        retry: "Попробовать снова",
      },
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
