import type { PublicLocale } from "@/lib/public-localization";

import type {
  ReportDecisionGround,
  ReportFormField,
  ReportReason,
  ReportTargetKind,
} from "./report-contract";

/**
 * The words of the complaint procedure (ADR-0038 D5, `OVE-526`): the report
 * form, the owner's list and the three emails, in the interface languages.
 */
export interface ReportCopy {
  link: string;
  form: {
    metadataTitle: string;
    title: string;
    question: Record<ReportTargetKind, string>;
    note: string;
    target: string;
    reasonsLabel: string;
    reasons: Record<ReportReason, string>;
    explanation: string;
    explanationHint: string;
    name: string;
    email: string;
    emailHint: string;
    goodFaith: string;
    submit: string;
    submitting: string;
    errors: Record<ReportFormField, string>;
    notFound: string;
    rateLimited: string;
    failed: string;
    receivedTitle: string;
    receivedBody: string;
    back: string;
  };
  owner: {
    title: string;
    description: string;
    empty: string;
    receivedHeading: string;
    decidedHeading: string;
    kinds: Record<ReportTargetKind, string>;
    reported: string;
    reporter: string;
    decisionLabel: string;
    keep: string;
    remove: Record<ReportTargetKind, string>;
    ground: string;
    grounds: Record<ReportDecisionGround, string>;
    facts: string;
    factsHint: string;
    decide: string;
    decided: Record<"kept" | "removed", string>;
    outcome: Record<"done" | "stale" | "failed" | "denied" | "invalid", string>;
  };
  mail: {
    receiptSubject: string;
    receiptBody: (input: { address: string; reason: string }) => string;
    decisionSubject: string;
    decisionBody: (input: {
      address: string;
      decision: "kept" | "removed";
      facts: string;
    }) => string;
    statementSubject: string;
    statementBody: (input: {
      restricted: string;
      facts: string;
      ground: string;
      supportEmail: string;
    }) => string;
    restricted: Record<
      ReportTargetKind | "comment",
      (address: string) => string
    >;
    groundLine: Record<ReportDecisionGround, string>;
    signature: string;
  };
}

const uk: ReportCopy = {
  link: "Поскаржитися",
  form: {
    metadataTitle: "Скарга",
    title: "Скарга",
    question: {
      entry: "Чому ви скаржитеся на цей запис?",
      profile: "Чому ви скаржитеся на цей профіль?",
      object: "Чому ви скаржитеся на цей паспорт рослини чи тварини?",
      topic: "Чому ви скаржитеся на цю сторінку тегу?",
    },
    note: "Кожну скаргу розглядає людина. Якщо комусь загрожує небезпека, телефонуйте 112 — не чекайте на нас.",
    target: "Сторінка",
    reasonsLabel: "Причина",
    reasons: {
      spam: "Спам або реклама",
      harassment: "Образи, погрози чи цькування",
      personal_data: "Чужі особисті дані",
      animal_cruelty: "Жорстоке поводження з тваринами",
      copyright: "Чужі фото чи текст без дозволу",
      illegal: "Незаконний вміст",
      other: "Інше",
    },
    explanation: "Що саме не так?",
    explanationHint:
      "Від 10 символів. Якщо це чуже фото чи текст, скажіть, чиє воно.",
    name: "Ваше ім'я",
    email: "Ваш email",
    emailHint: "Сюди надійде підтвердження і рішення.",
    goodFaith:
      "Я добросовісно вважаю, що все сказане в цій скарзі — правда і воно повне.",
    submit: "Надіслати скаргу",
    submitting: "Надсилаємо…",
    errors: {
      address:
        "Цю сторінку не можна знайти. Відкрийте скаргу з самої сторінки.",
      reason: "Виберіть причину.",
      explanation: "Опишіть, що не так: від 10 до 2000 символів.",
      name: "Вкажіть ім'я.",
      email: "Вкажіть email, на який ми зможемо відповісти.",
      goodFaith: "Підтвердьте, що скаржитеся добросовісно.",
    },
    notFound: "Цієї сторінки вже немає або вона не публічна.",
    rateLimited: "Забагато скарг з цієї мережі. Спробуйте за годину.",
    failed: "Не вдалося надіслати скаргу. Спробуйте ще раз.",
    receivedTitle: "Скаргу отримано",
    receivedBody:
      "Ми надіслали підтвердження на ваш email. Коли розглянемо скаргу, напишемо, яке рішення ухвалили.",
    back: "Повернутися на сторінку",
  },
  owner: {
    title: "Скарги",
    description:
      "Скарги на записи, профілі, паспорти й теги. Рішення надсилається тому, хто скаржився, а якщо вміст прибрано — ще й автору з поясненням.",
    empty: "Нових скарг немає.",
    receivedHeading: "Нові",
    decidedHeading: "Розглянуті",
    kinds: {
      entry: "Запис",
      profile: "Профіль",
      object: "Паспорт",
      topic: "Тег",
    },
    reported: "Надійшла",
    reporter: "Від",
    decisionLabel: "Рішення",
    keep: "Залишити",
    remove: {
      entry: "Видалити запис",
      profile: "Прибрати ім'я, опис і фото профілю",
      object: "Прибрати назву й фото",
      topic: "Прибрати сторінку тегу",
    },
    ground: "Підстава",
    grounds: {
      "terms-content": "Умови: що можна публікувати",
      "terms-photo-licence": "Умови: ліцензія на фото",
      "terms-account": "Умови: ваш акаунт",
      law: "Закон",
    },
    facts: "Факти, які ви врахували",
    factsHint: "Їх прочитають той, хто скаржився, і автор.",
    decide: "Ухвалити рішення",
    decided: { kept: "Залишено", removed: "Прибрано" },
    outcome: {
      done: "Рішення збережено, листи надіслано.",
      stale: "Цю скаргу вже розглянуто.",
      failed: "Не вдалося зберегти рішення. Спробуйте ще раз.",
      denied: "Розглядати скарги може лише власник.",
      invalid: "Виберіть рішення, підставу для видалення й опишіть факти.",
    },
  },
  mail: {
    receiptSubject: "Ми отримали вашу скаргу",
    receiptBody: ({ address, reason }) =>
      [
        "Дякуємо. Ми отримали вашу скаргу на сторінку:",
        address,
        "",
        `Причина: ${reason}.`,
        "",
        "Її розгляне людина. Коли ми ухвалимо рішення, напишемо вам.",
      ].join("\n"),
    decisionSubject: "Рішення щодо вашої скарги",
    decisionBody: ({ address, decision, facts }) =>
      [
        "Ми розглянули вашу скаргу на сторінку:",
        address,
        "",
        decision === "removed"
          ? "Рішення: вміст прибрано."
          : "Рішення: вміст залишено.",
        `Чому: ${facts}`,
        "",
        "Рішення ухвалила людина, без автоматизації. Оскаржити його можна, відповівши на цей лист.",
      ].join("\n"),
    statementSubject: "Ми прибрали ваш вміст: пояснення",
    statementBody: ({ restricted, facts, ground, supportEmail }) =>
      [
        restricted,
        "",
        `Факти: ${facts}`,
        `Підстава: ${ground}`,
        "Рішення ухвалила людина; автоматизація не використовувалася.",
        "",
        `Оскаржити рішення можна, відповівши на цей лист або написавши на ${supportEmail}. Ви також можете звернутися до суду.`,
      ].join("\n"),
    restricted: {
      entry: (address) => `Ми видалили ваш запис ${address} після скарги.`,
      profile: (address) =>
        `Ми прибрали ім'я, опис і фото вашого профілю ${address} після скарги.`,
      object: (address) =>
        `Ми прибрали назву й фото вашого паспорта ${address} після скарги.`,
      topic: (address) => `Ми прибрали сторінку тегу ${address} після скарги.`,
      comment: (address) => `Ми видалили ваш коментар на сторінці ${address}.`,
    },
    groundLine: {
      "terms-content":
        "розділ «Що можна публікувати» умов використання, https://over.garden/terms#terms-content",
      "terms-photo-licence":
        "розділ «Ліцензія на фото» умов використання, https://over.garden/terms#terms-photo-licence",
      "terms-account":
        "розділ «Ваш акаунт» умов використання, https://over.garden/terms#terms-account",
      law: "вимога закону",
    },
    signature: "— Overgarden",
  },
};

const bg: ReportCopy = {
  link: "Подаване на сигнал",
  form: {
    metadataTitle: "Сигнал",
    title: "Сигнал",
    question: {
      entry: "Защо подавате сигнал за този запис?",
      profile: "Защо подавате сигнал за този профил?",
      object: "Защо подавате сигнал за този паспорт на растение или животно?",
      topic: "Защо подавате сигнал за тази страница с етикет?",
    },
    note: "Всеки сигнал се разглежда от човек. Ако някой е в опасност, обадете се на 112 — не чакайте нас.",
    target: "Страница",
    reasonsLabel: "Причина",
    reasons: {
      spam: "Спам или реклама",
      harassment: "Обиди, заплахи или тормоз",
      personal_data: "Чужди лични данни",
      animal_cruelty: "Жестоко отношение към животни",
      copyright: "Чужди снимки или текст без разрешение",
      illegal: "Незаконно съдържание",
      other: "Друго",
    },
    explanation: "Какво точно не е наред?",
    explanationHint:
      "Поне 10 знака. Ако е чужда снимка или текст, кажете чии са.",
    name: "Вашето име",
    email: "Вашият имейл",
    emailHint: "Тук ще получите потвърждение и решението.",
    goodFaith:
      "Добросъвестно смятам, че казаното в този сигнал е вярно и пълно.",
    submit: "Изпращане на сигнала",
    submitting: "Изпращаме…",
    errors: {
      address:
        "Тази страница не може да бъде намерена. Отворете сигнала от самата страница.",
      reason: "Изберете причина.",
      explanation: "Опишете какво не е наред: от 10 до 2000 знака.",
      name: "Посочете име.",
      email: "Посочете имейл, на който можем да отговорим.",
      goodFaith: "Потвърдете, че подавате сигнала добросъвестно.",
    },
    notFound: "Тази страница вече я няма или не е публична.",
    rateLimited: "Твърде много сигнали от тази мрежа. Опитайте след час.",
    failed: "Сигналът не беше изпратен. Опитайте отново.",
    receivedTitle: "Сигналът е получен",
    receivedBody:
      "Изпратихме потвърждение на имейла ви. Когато разгледаме сигнала, ще ви пишем какво сме решили.",
    back: "Обратно към страницата",
  },
  owner: {
    title: "Сигнали",
    description:
      "Сигнали за записи, профили, паспорти и етикети. Решението се изпраща на подателя, а ако съдържанието е премахнато — и на автора, с обяснение.",
    empty: "Няма нови сигнали.",
    receivedHeading: "Нови",
    decidedHeading: "Разгледани",
    kinds: {
      entry: "Запис",
      profile: "Профил",
      object: "Паспорт",
      topic: "Етикет",
    },
    reported: "Получен",
    reporter: "От",
    decisionLabel: "Решение",
    keep: "Запазване",
    remove: {
      entry: "Изтриване на записа",
      profile: "Премахване на името, описанието и снимката на профила",
      object: "Премахване на името и снимката",
      topic: "Премахване на страницата с етикета",
    },
    ground: "Основание",
    grounds: {
      "terms-content": "Условия: какво може да се публикува",
      "terms-photo-licence": "Условия: лиценз за снимките",
      "terms-account": "Условия: вашият профил",
      law: "Закон",
    },
    facts: "Факти, които сте взели предвид",
    factsHint: "Ще ги прочетат подателят и авторът.",
    decide: "Вземане на решение",
    decided: { kept: "Запазено", removed: "Премахнато" },
    outcome: {
      done: "Решението е запазено, имейлите са изпратени.",
      stale: "Този сигнал вече е разгледан.",
      failed: "Решението не беше запазено. Опитайте отново.",
      denied: "Само собственикът може да разглежда сигнали.",
      invalid: "Изберете решение, основание за премахване и опишете фактите.",
    },
  },
  mail: {
    receiptSubject: "Получихме сигнала ви",
    receiptBody: ({ address, reason }) =>
      [
        "Благодарим. Получихме сигнала ви за страницата:",
        address,
        "",
        `Причина: ${reason}.`,
        "",
        "Ще го разгледа човек. Когато вземем решение, ще ви пишем.",
      ].join("\n"),
    decisionSubject: "Решение по сигнала ви",
    decisionBody: ({ address, decision, facts }) =>
      [
        "Разгледахме сигнала ви за страницата:",
        address,
        "",
        decision === "removed"
          ? "Решение: съдържанието е премахнато."
          : "Решение: съдържанието е запазено.",
        `Защо: ${facts}`,
        "",
        "Решението е взето от човек, без автоматизация. Можете да го обжалвате, като отговорите на този имейл.",
      ].join("\n"),
    statementSubject: "Премахнахме ваше съдържание: обяснение",
    statementBody: ({ restricted, facts, ground, supportEmail }) =>
      [
        restricted,
        "",
        `Факти: ${facts}`,
        `Основание: ${ground}`,
        "Решението е взето от човек; не е използвана автоматизация.",
        "",
        `Можете да обжалвате решението, като отговорите на този имейл или пишете на ${supportEmail}. Можете да се обърнете и към съда.`,
      ].join("\n"),
    restricted: {
      entry: (address) => `Изтрихме записа ви ${address} след сигнал.`,
      profile: (address) =>
        `Премахнахме името, описанието и снимката на профила ви ${address} след сигнал.`,
      object: (address) =>
        `Премахнахме името и снимката на паспорта ви ${address} след сигнал.`,
      topic: (address) =>
        `Премахнахме страницата с етикета ${address} след сигнал.`,
      comment: (address) => `Изтрихме коментара ви на страницата ${address}.`,
    },
    groundLine: {
      "terms-content":
        "раздел «Какво може да се публикува» от условията за ползване, https://over.garden/bg/terms#terms-content",
      "terms-photo-licence":
        "раздел «Лиценз за снимките» от условията за ползване, https://over.garden/bg/terms#terms-photo-licence",
      "terms-account":
        "раздел «Вашият профил» от условията за ползване, https://over.garden/bg/terms#terms-account",
      law: "изискване на закона",
    },
    signature: "— Overgarden",
  },
};

const ru: ReportCopy = {
  link: "Пожаловаться",
  form: {
    metadataTitle: "Жалоба",
    title: "Жалоба",
    question: {
      entry: "Почему вы жалуетесь на эту запись?",
      profile: "Почему вы жалуетесь на этот профиль?",
      object: "Почему вы жалуетесь на этот паспорт растения или животного?",
      topic: "Почему вы жалуетесь на эту страницу тега?",
    },
    note: "Каждую жалобу рассматривает человек. Если кому-то угрожает опасность, звоните 112 — не ждите нас.",
    target: "Страница",
    reasonsLabel: "Причина",
    reasons: {
      spam: "Спам или реклама",
      harassment: "Оскорбления, угрозы или травля",
      personal_data: "Чужие личные данные",
      animal_cruelty: "Жестокое обращение с животными",
      copyright: "Чужие фото или текст без разрешения",
      illegal: "Незаконный контент",
      other: "Другое",
    },
    explanation: "Что именно не так?",
    explanationHint:
      "От 10 символов. Если это чужое фото или текст, скажите, чьё оно.",
    name: "Ваше имя",
    email: "Ваш email",
    emailHint: "Сюда придут подтверждение и решение.",
    goodFaith:
      "Я добросовестно считаю, что всё сказанное в этой жалобе — правда и оно полное.",
    submit: "Отправить жалобу",
    submitting: "Отправляем…",
    errors: {
      address:
        "Эту страницу не удаётся найти. Откройте жалобу с самой страницы.",
      reason: "Выберите причину.",
      explanation: "Опишите, что не так: от 10 до 2000 символов.",
      name: "Укажите имя.",
      email: "Укажите email, на который мы сможем ответить.",
      goodFaith: "Подтвердите, что жалуетесь добросовестно.",
    },
    notFound: "Этой страницы уже нет или она не публична.",
    rateLimited: "Слишком много жалоб из этой сети. Попробуйте через час.",
    failed: "Не удалось отправить жалобу. Попробуйте ещё раз.",
    receivedTitle: "Жалоба получена",
    receivedBody:
      "Мы отправили подтверждение на ваш email. Когда рассмотрим жалобу, напишем, какое решение приняли.",
    back: "Вернуться на страницу",
  },
  owner: {
    title: "Жалобы",
    description:
      "Жалобы на записи, профили, паспорта и теги. Решение отправляется тому, кто пожаловался, а если контент убран — ещё и автору с объяснением.",
    empty: "Новых жалоб нет.",
    receivedHeading: "Новые",
    decidedHeading: "Рассмотренные",
    kinds: {
      entry: "Запись",
      profile: "Профиль",
      object: "Паспорт",
      topic: "Тег",
    },
    reported: "Поступила",
    reporter: "От",
    decisionLabel: "Решение",
    keep: "Оставить",
    remove: {
      entry: "Удалить запись",
      profile: "Убрать имя, описание и фото профиля",
      object: "Убрать название и фото",
      topic: "Убрать страницу тега",
    },
    ground: "Основание",
    grounds: {
      "terms-content": "Условия: что можно публиковать",
      "terms-photo-licence": "Условия: лицензия на фото",
      "terms-account": "Условия: ваш аккаунт",
      law: "Закон",
    },
    facts: "Факты, которые вы учли",
    factsHint: "Их прочитают тот, кто пожаловался, и автор.",
    decide: "Принять решение",
    decided: { kept: "Оставлено", removed: "Убрано" },
    outcome: {
      done: "Решение сохранено, письма отправлены.",
      stale: "Эта жалоба уже рассмотрена.",
      failed: "Не удалось сохранить решение. Попробуйте ещё раз.",
      denied: "Рассматривать жалобы может только владелец.",
      invalid: "Выберите решение, основание для удаления и опишите факты.",
    },
  },
  mail: {
    receiptSubject: "Мы получили вашу жалобу",
    receiptBody: ({ address, reason }) =>
      [
        "Спасибо. Мы получили вашу жалобу на страницу:",
        address,
        "",
        `Причина: ${reason}.`,
        "",
        "Её рассмотрит человек. Когда мы примем решение, напишем вам.",
      ].join("\n"),
    decisionSubject: "Решение по вашей жалобе",
    decisionBody: ({ address, decision, facts }) =>
      [
        "Мы рассмотрели вашу жалобу на страницу:",
        address,
        "",
        decision === "removed"
          ? "Решение: контент убран."
          : "Решение: контент оставлен.",
        `Почему: ${facts}`,
        "",
        "Решение принял человек, без автоматизации. Обжаловать его можно, ответив на это письмо.",
      ].join("\n"),
    statementSubject: "Мы убрали ваш контент: объяснение",
    statementBody: ({ restricted, facts, ground, supportEmail }) =>
      [
        restricted,
        "",
        `Факты: ${facts}`,
        `Основание: ${ground}`,
        "Решение принял человек; автоматизация не использовалась.",
        "",
        `Обжаловать решение можно, ответив на это письмо или написав на ${supportEmail}. Вы также можете обратиться в суд.`,
      ].join("\n"),
    restricted: {
      entry: (address) => `Мы удалили вашу запись ${address} после жалобы.`,
      profile: (address) =>
        `Мы убрали имя, описание и фото вашего профиля ${address} после жалобы.`,
      object: (address) =>
        `Мы убрали название и фото вашего паспорта ${address} после жалобы.`,
      topic: (address) => `Мы убрали страницу тега ${address} после жалобы.`,
      comment: (address) =>
        `Мы удалили ваш комментарий на странице ${address}.`,
    },
    groundLine: {
      "terms-content":
        "раздел «Что можно публиковать» условий использования, https://over.garden/ru/terms#terms-content",
      "terms-photo-licence":
        "раздел «Лицензия на фото» условий использования, https://over.garden/ru/terms#terms-photo-licence",
      "terms-account":
        "раздел «Ваш аккаунт» условий использования, https://over.garden/ru/terms#terms-account",
      law: "требование закона",
    },
    signature: "— Overgarden",
  },
};

const COPY: Record<PublicLocale, ReportCopy> = { uk, bg, ru };

export function getReportCopy(locale: PublicLocale): ReportCopy {
  return COPY[locale];
}
