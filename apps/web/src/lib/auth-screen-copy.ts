import type { InterfaceLocale } from "@/lib/interface-localization";
import type { AuthScreenNotice } from "@/lib/navigation/sign-in-href";

/**
 * The words of the four authentication screens that `OVE-504` added: the mode
 * switch, the states a submission can end in, and the reasons a reader can be
 * sent here that are not an action of theirs.
 *
 * The field labels, the refusals and the provider copy stay in
 * `trust-surface-copy.ts`, where the anti-enumeration wording is tested; this
 * file only says what happens around them. Every state is its own sentence,
 * because every state has a different next step (criterion 5).
 */
export interface AuthScreenCopy {
  modes: { label: string; signIn: string; signUp: string };
  signIn: { title: string; description: string };
  signUp: { title: string; description: string };
  /** Under an action's heading: the reader is coming back to it. */
  intentDescription: string;
  pending: {
    signIn: string;
    signUp: string;
    social: string;
    resetRequest: string;
    resetPassword: string;
  };
  /** The sign-in succeeded and the browser is on its way. */
  signedInOpening: string;
  /** The request never came back: nothing is known about its outcome. */
  transportFailed: string;
  /** The password was right and the address is not verified yet. */
  verifyEmail: string;
  notices: Record<AuthScreenNotice, string> & { verificationExpired: string };
  signedIn: {
    title: string;
    verifiedTitle: string;
    description: string;
    verifiedDescription: string;
    continue: string;
    toGarden: string;
    switchAccount: string;
  };
  returnToTab: { title: string; description: string; close: string };
  help: {
    title: string;
    description: string;
    back: string;
    rateLimited: string;
    sentHint: string;
    /** Before the link to this screen, under the sign-in form. */
    trouble: string;
  };
  reset: {
    expiredTitle: string;
    expiredDescription: string;
    requestNew: string;
    /** Better Auth's own bounds on a password, when one falls outside them. */
    passwordRule: string;
  };
  backToReading: string;
}

const UK: AuthScreenCopy = {
  modes: { label: "Вхід або реєстрація", signIn: "Вхід", signUp: "Реєстрація" },
  signIn: {
    title: "Вхід до OverGarden",
    description:
      "Входьте щоразу з тією самою адресою електронної пошти — так усі ваші записи залишаться в одному саду.",
  },
  signUp: {
    title: "Новий обліковий запис",
    description:
      "Обліковий запис потрібен, щоб вести сад і публікувати записи. Опубліковані записи бачать усі.",
  },
  intentDescription:
    "Після входу ви повернетеся туди, де були, до тієї самої дії.",
  pending: {
    signIn: "Входимо…",
    signUp: "Створюємо обліковий запис…",
    social: "Переходимо до Google…",
    resetRequest: "Надсилаємо посилання…",
    resetPassword: "Оновлюємо пароль…",
  },
  signedInOpening: "Вхід виконано. Відкриваємо сторінку…",
  transportFailed:
    "Зв’язок з OverGarden перервався, і відповіді немає. Перевірте інтернет і спробуйте ще раз — введене залишилося тут.",
  verifyEmail:
    "Спершу підтвердьте адресу електронної пошти. Ми щойно надіслали на неї лист із посиланням — відкрийте його, і ви ввійдете та повернетеся сюди.",
  notices: {
    "intent-expired":
      "Минуло понад 15 хвилин, тож дію не буде продовжено автоматично. Увійдіть — ми повернемо вас на ту саму сторінку, і ви зможете її повторити.",
    "intent-invalid":
      "Цю дію не вдалося перевірити, тож ми її не продовжимо. Увійдіть і повторіть її на сторінці.",
    "password-reset":
      "Пароль оновлено, а всі попередні сеанси завершено. Увійдіть із новим паролем.",
    "return-to-tab":
      "Неопублікований текст залишився в попередній вкладці. Увійдіть тут, потім поверніться туди й натисніть кнопку ще раз — текст на місці.",
    verificationExpired:
      "Посилання для підтвердження застаріло або вже використане. Увійдіть — і ми надішлемо нове.",
  },
  signedIn: {
    title: "Ви вже ввійшли",
    verifiedTitle: "Адресу підтверджено",
    description: "У цьому браузері ви вже ввійшли в OverGarden.",
    verifiedDescription: "Ви ввійшли в OverGarden і можете продовжувати.",
    continue: "Продовжити",
    toGarden: "До мого саду",
    switchAccount: "Щоб увійти з іншим обліковим записом, спершу вийдіть.",
  },
  returnToTab: {
    title: "Ви знову ввійшли",
    description:
      "Поверніться до попередньої вкладки й натисніть кнопку ще раз — текст там. Цю вкладку можна закрити.",
    close: "Закрити цю вкладку",
  },
  help: {
    title: "Допомога зі входом",
    description:
      "Надішлемо одноразове посилання, щоб ви задали новий пароль для того самого облікового запису.",
    back: "Назад до входу",
    rateLimited:
      "Забагато запитів поспіль. Зачекайте кілька хвилин і спробуйте ще раз.",
    sentHint: "Лист може йти кілька хвилин — перевірте й теку «Спам».",
    trouble: "Не вдається ввійти?",
  },
  reset: {
    expiredTitle: "Посилання для відновлення недійсне",
    expiredDescription:
      "Посилання діє обмежений час і лише один раз. Надішліть собі нове — це займе хвилину.",
    requestNew: "Надіслати нове посилання",
    passwordRule: "Пароль має містити від 8 до 128 символів.",
  },
  backToReading: "Повернутися до читання",
};

const BG: AuthScreenCopy = {
  modes: {
    label: "Вход или регистрация",
    signIn: "Вход",
    signUp: "Регистрация",
  },
  signIn: {
    title: "Вход в OverGarden",
    description:
      "Влизайте всеки път с един и същ имейл — така всичките ви записи остават в една градина.",
  },
  signUp: {
    title: "Нов профил",
    description:
      "Профилът е нужен, за да водите градина и да публикувате записи. Публикуваните записи са видими за всички.",
  },
  intentDescription:
    "След като влезете, ще се върнете там, където бяхте, към същото действие.",
  pending: {
    signIn: "Влизане…",
    signUp: "Създаване на профила…",
    social: "Към Google…",
    resetRequest: "Изпращане на връзката…",
    resetPassword: "Обновяване на паролата…",
  },
  signedInOpening: "Влязохте. Отваряме страницата…",
  transportFailed:
    "Връзката с OverGarden прекъсна и няма отговор. Проверете интернета и опитайте отново — въведеното остава тук.",
  verifyEmail:
    "Първо потвърдете имейла си. Току-що изпратихме писмо с връзка — отворете го и ще влезете и ще се върнете тук.",
  notices: {
    "intent-expired":
      "Минаха повече от 15 минути, затова действието няма да продължи автоматично. Влезте — ще ви върнем на същата страница и ще можете да го повторите.",
    "intent-invalid":
      "Това действие не можа да бъде проверено, затова няма да продължи. Влезте и го повторете на страницата.",
    "password-reset":
      "Паролата е обновена и всички предишни сесии са прекратени. Влезте с новата парола.",
    "return-to-tab":
      "Непубликуваният текст остана в предишния раздел. Влезте тук, после се върнете там и натиснете бутона отново — текстът е на мястото си.",
    verificationExpired:
      "Връзката за потвърждение е изтекла или вече е използвана. Влезте — ще ви изпратим нова.",
  },
  signedIn: {
    title: "Вече сте влезли",
    verifiedTitle: "Имейлът е потвърден",
    description: "В този браузър вече сте влезли в OverGarden.",
    verifiedDescription: "Влязохте в OverGarden и можете да продължите.",
    continue: "Продължаване",
    toGarden: "Към моята градина",
    switchAccount: "За да влезете с друг профил, първо излезте.",
  },
  returnToTab: {
    title: "Влязохте отново",
    description:
      "Върнете се в предишния раздел и натиснете бутона отново — текстът е там. Този раздел може да бъде затворен.",
    close: "Затваряне на този раздел",
  },
  help: {
    title: "Помощ за вход",
    description:
      "Ще изпратим еднократна връзка, за да зададете нова парола за същия профил.",
    back: "Обратно към входа",
    rateLimited:
      "Твърде много заявки подред. Изчакайте няколко минути и опитайте отново.",
    sentHint:
      "Писмото може да пристигне след няколко минути — проверете и папка „Спам“.",
    trouble: "Не можете да влезете?",
  },
  reset: {
    expiredTitle: "Връзката за възстановяване е невалидна",
    expiredDescription:
      "Връзката е валидна ограничено време и само веднъж. Изпратете си нова — отнема минута.",
    requestNew: "Изпращане на нова връзка",
    passwordRule: "Паролата трябва да е между 8 и 128 знака.",
  },
  backToReading: "Обратно към четенето",
};

const RU: AuthScreenCopy = {
  modes: {
    label: "Вход или регистрация",
    signIn: "Вход",
    signUp: "Регистрация",
  },
  signIn: {
    title: "Вход в OverGarden",
    description:
      "Входите каждый раз с одним и тем же адресом электронной почты — так все ваши записи останутся в одном саду.",
  },
  signUp: {
    title: "Новый аккаунт",
    description:
      "Аккаунт нужен, чтобы вести сад и публиковать записи. Опубликованные записи видны всем.",
  },
  intentDescription:
    "После входа вы вернётесь туда, где были, к тому же действию.",
  pending: {
    signIn: "Входим…",
    signUp: "Создаём аккаунт…",
    social: "Переходим в Google…",
    resetRequest: "Отправляем ссылку…",
    resetPassword: "Обновляем пароль…",
  },
  signedInOpening: "Вход выполнен. Открываем страницу…",
  transportFailed:
    "Связь с OverGarden прервалась, ответа нет. Проверьте интернет и попробуйте ещё раз — введённое осталось здесь.",
  verifyEmail:
    "Сначала подтвердите адрес электронной почты. Мы только что отправили на него письмо со ссылкой — откройте его, и вы войдёте и вернётесь сюда.",
  notices: {
    "intent-expired":
      "Прошло больше 15 минут, поэтому действие не продолжится автоматически. Войдите — мы вернём вас на ту же страницу, и вы сможете его повторить.",
    "intent-invalid":
      "Это действие не удалось проверить, поэтому мы его не продолжим. Войдите и повторите его на странице.",
    "password-reset":
      "Пароль обновлён, а все прежние сеансы завершены. Войдите с новым паролем.",
    "return-to-tab":
      "Неопубликованный текст остался в предыдущей вкладке. Войдите здесь, затем вернитесь туда и нажмите кнопку ещё раз — текст на месте.",
    verificationExpired:
      "Ссылка для подтверждения устарела или уже использована. Войдите — и мы отправим новую.",
  },
  signedIn: {
    title: "Вы уже вошли",
    verifiedTitle: "Адрес подтверждён",
    description: "В этом браузере вы уже вошли в OverGarden.",
    verifiedDescription: "Вы вошли в OverGarden и можете продолжать.",
    continue: "Продолжить",
    toGarden: "В мой сад",
    switchAccount: "Чтобы войти с другим аккаунтом, сначала выйдите.",
  },
  returnToTab: {
    title: "Вы снова вошли",
    description:
      "Вернитесь в предыдущую вкладку и нажмите кнопку ещё раз — текст там. Эту вкладку можно закрыть.",
    close: "Закрыть эту вкладку",
  },
  help: {
    title: "Помощь со входом",
    description:
      "Отправим одноразовую ссылку, чтобы вы задали новый пароль для того же аккаунта.",
    back: "Назад ко входу",
    rateLimited:
      "Слишком много запросов подряд. Подождите несколько минут и попробуйте ещё раз.",
    sentHint: "Письмо может идти несколько минут — проверьте и папку «Спам».",
    trouble: "Не получается войти?",
  },
  reset: {
    expiredTitle: "Ссылка для восстановления недействительна",
    expiredDescription:
      "Ссылка действует ограниченное время и только один раз. Отправьте себе новую — это займёт минуту.",
    requestNew: "Отправить новую ссылку",
    passwordRule: "Пароль должен содержать от 8 до 128 символов.",
  },
  backToReading: "Вернуться к чтению",
};

const AUTH_SCREEN_COPY: Record<InterfaceLocale, AuthScreenCopy> = {
  uk: UK,
  bg: BG,
  ru: RU,
};

export function getAuthScreenCopy(locale: InterfaceLocale): AuthScreenCopy {
  return AUTH_SCREEN_COPY[locale];
}
