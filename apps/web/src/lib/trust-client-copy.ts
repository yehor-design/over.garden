import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The trust sentences a client component reads, and nothing else
 * (`OVE-468`).
 *
 * The analytics notice, the Meta consent, the global error page and the
 * shell's account and sign-out controls are client components. They used to import `trust-surface-copy.ts` and
 * `public-surface-localization.ts` to read a dozen sentences, which put both
 * modules — every privacy, sign-in, support and public-page sentence in three
 * languages, 150 kB before compression — into the script of every public page.
 * The two large modules now compose these same objects, so each sentence
 * still has one home.
 */

const UK = {
  signOut: {
    action: "Вийти з акаунта",
    accountSectionTitle: "Акаунт і безпека",
    accountSectionDescription:
      "Завершіть доступ до цього саду в поточному браузері. Ваш акаунт, роль і дані на сервері залишаться без змін.",
    accountMenuTitle: "Акаунт",
    accountMenuDescription:
      "Відкрийте налаштування профілю або безпечно завершіть поточний сеанс.",
    openAccountMenu: "Відкрити меню акаунта",
    closeAccountMenu: "Закрити меню акаунта",
    openProfile: "Відкрити мій профіль",
    operatorRegionLabel: "Керування поточним сеансом",
    backToGarden: "До мого саду",
    checking: "Перевіряємо локальні зміни…",
    servedUnresolved:
      "Не вдалося повторно підтвердити сеанс. Показуємо вже відкритий сервером сад в обмеженому режимі; кожна зміна перевіряється окремо.",
    confirmationTitle: "Завершити сеанс?",
    confirmationDescription:
      "До успішної публікації текст залишається лише у відкритій вкладці. Чернетки не зберігаються; вихід, закриття чи перезавантаження вкладки видалить неопубліковані зміни.",
    confirmationCancel: "Залишитися в акаунті",
    confirmationAction: "Вийти",
    errorTitle: "Не вдалося безпечно завершити сеанс",
    localCheckError:
      "Не вдалося перевірити локальні зміни. Нічого не видалено, і ви залишаєтеся в акаунті.",
    fallbackExitDescription:
      "До успішної публікації текст залишається лише у відкритій вкладці. Чернетки не зберігаються; вихід, закриття чи перезавантаження вкладки видалить неопубліковані зміни.",
    fallbackExitAction: "Вийти",
    fallbackExitPending: "Завершуємо сеанс…",
    fallbackExitUnconfirmedError:
      "Не вдалося підтвердити вихід. Спробуйте ще раз.",
    blockedAccountMethodsRegionLabel: "Керування способами входу",
    blockedAccountMethodsDescription:
      "Сад поки недоступний, але ви можете безпечно змінити спосіб входу.",
    blockedAccountMethodsAction: "Керувати способами входу",
    blockedAccountMethodsPending: "Перевіряємо способи входу…",
    blockedAccountErasureAction: "Надіслати запит на видалення даних",
    blockedAccountMethodsUnavailable:
      "Не вдалося безпечно перевірити способи входу. Нічого не змінено. Спробуйте ще раз або вийдіть з акаунта.",
    blockedAccountMethodsServedUnresolved:
      "Не вдалося повторно підтвердити способи входу. Показуємо обмежений стан без змін даних.",
    retry: "Спробувати ще раз",
    reloadAndRecheck: "Перезавантажити й перевірити сеанс",
  },
  analyticsConsent: {
    label: "Згода на аналітику",
    message:
      "Дозволите Google вимірювати відвідування головної, статей і довідкових сторінок?",
    messageWithClarity:
      "Дозволите Google і Microsoft вимірювати відвідування головної, статей і довідкових сторінок?",
    details: "Докладніше",
    accept: "Дозволити",
    decline: "Не дозволяти",
  },
  analytics: {
    title: "Публічна аналітика",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Дозволено",
      declined: "Вимкнено",
      undecided: "Не вибрано",
    },
    description:
      "Після вашого дозволу Google Analytics і Microsoft Clarity вимірюють відвідування лише головної сторінки, статей (блог, відповіді, посібники, ринки) і сторінок про приватність, підтримку та першу публікацію. Сад, записи садівників, профілі, каталог, вхід і все особисте не вимірюються.",
    clarityEnabled:
      "Microsoft Clarity увімкнено для цього розгортання й запускається після згоди.",
    clarityDisabled: "Microsoft Clarity вимкнено для цього розгортання.",
    allow: "Дозволити аналітику",
    turnOff: "Вимкнути",
    technicalSummary: "Як зберігається ваш вибір",
    preferenceKey: "Ключ налаштування:",
    preferenceDescription:
      "Вимкнення припиняє майбутнє завантаження Google Tag Manager / Google Analytics і відкликає доступ Microsoft Clarity до аналітичного сховища для поточної сторінки, якщо Clarity уже ініціалізовано.",
  },
  marketing: {
    title: "Маркетингові вимірювання Meta",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Дозволено",
      declined: "Вимкнено",
      undecided: "Не вибрано",
      deploymentOff: "Вимкнено для цього розгортання",
    },
    description:
      "Коли функцію ввімкнено й користувач явно погодився, OverGarden може надсилати в Meta Ads лише дозволені класи подій, наприклад перегляд публічної промосторінки або публікація першого запису. OverGarden не надсилає текст журналу, назви власних рослин, вибір каталогу, точне місце, ключі медіа, дані зворотного виклику входу, адреси електронної пошти, ідентифікатори акаунта, файли cookie, IP-адресу чи дані user-agent.",
    allow: "Дозволити маркетингові вимірювання",
    turnOff: "Вимкнути",
    technicalSummary: "Як зберігається ваш вибір",
    preferenceKey: "Ключ налаштування:",
    preferenceDescription:
      "Вимкнення відкликає майбутні події браузерного Meta Pixel і припиняє постановку подій Meta Conversions API з цього браузера в чергу OverGarden.",
    consentLabel: "Згода на маркетингові вимірювання Meta",
    consentMessage:
      "OverGarden може вимірювати переходи з реклами Meta лише з вашого дозволу. Вимірювання працює тільки на публічних, юридичних сторінках і сторінках підтримки та надсилає лише дозволені класи подій — ніколи не текст садового журналу, точне місце, медіа, дані входу чи ідентифікатори акаунта.",
    keepOff: "Не дозволяти",
  },
  supportTitle: "Підтримка й питання приватності",
  privacyTitle: "Повідомлення про приватність",
} as const;

const BG = {
  signOut: {
    action: "Изход от акаунта",
    accountSectionTitle: "Акаунт и сигурност",
    accountSectionDescription:
      "Прекратете достъпа до тази градина в текущия браузър. Акаунтът, ролята и данните ви на сървъра остават непроменени.",
    accountMenuTitle: "Акаунт",
    accountMenuDescription:
      "Отворете настройките на профила или прекратете безопасно текущата сесия.",
    openAccountMenu: "Отваряне на менюто на акаунта",
    closeAccountMenu: "Затваряне на менюто на акаунта",
    openProfile: "Отваряне на моя профил",
    operatorRegionLabel: "Управление на текущата сесия",
    backToGarden: "Към моята градина",
    checking: "Проверяваме локалните промени…",
    servedUnresolved:
      "Не успяхме да потвърдим сесията отново. Показваме вече отворената от сървъра градина в ограничен режим; всяка промяна се проверява отделно.",
    confirmationTitle: "Да прекратим ли сесията?",
    confirmationDescription:
      "До успешно публикуване текстът остава само в отворения раздел. Чернови не се запазват; изход, затваряне или презареждане на раздела премахва непубликуваните промени.",
    confirmationCancel: "Оставане в акаунта",
    confirmationAction: "Изход",
    errorTitle: "Сесията не можа да бъде прекратена безопасно",
    localCheckError:
      "Локалните промени не можаха да бъдат проверени. Нищо не е изтрито и оставате в акаунта.",
    fallbackExitDescription:
      "До успешно публикуване текстът остава само в отворения раздел. Чернови не се запазват; изход, затваряне или презареждане на раздела премахва непубликуваните промени.",
    fallbackExitAction: "Изход",
    fallbackExitPending: "Завършване на сесията…",
    fallbackExitUnconfirmedError:
      "Изходът не можа да бъде потвърден. Опитайте отново.",
    blockedAccountMethodsRegionLabel: "Управление на начините за вход",
    blockedAccountMethodsDescription:
      "Градината засега не е достъпна, но можете безопасно да промените начина си за вход.",
    blockedAccountMethodsAction: "Управление на начините за вход",
    blockedAccountMethodsPending: "Проверяваме начините за вход…",
    blockedAccountErasureAction: "Изпращане на заявка за изтриване на данни",
    blockedAccountMethodsUnavailable:
      "Начините за вход не можаха да бъдат проверени безопасно. Нищо не е променено. Опитайте отново или излезте от акаунта.",
    blockedAccountMethodsServedUnresolved:
      "Начините за вход не можаха да бъдат потвърдени отново. Показваме ограничено състояние без промяна на данни.",
    retry: "Опитайте отново",
    reloadAndRecheck: "Презареждане и проверка на сесията",
  },
  analyticsConsent: {
    label: "Съгласие за анализ",
    message:
      "Разрешавате ли на Google да измерва посещенията на началната страница, статиите и справочните страници?",
    messageWithClarity:
      "Разрешавате ли на Google и Microsoft да измерват посещенията на началната страница, статиите и справочните страници?",
    details: "Повече",
    accept: "Разрешавам",
    decline: "Не разрешавам",
  },
  analytics: {
    title: "Публични анализи",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Разрешени",
      declined: "Изключени",
      undecided: "Не е избрано",
    },
    description:
      "След вашето разрешение Google Analytics и Microsoft Clarity измерват посещенията само на началната страница, статиите (блог, отговори, ръководства, пазари) и страниците за поверителност, поддръжка и първа публикация. Градината, записите на градинарите, профилите, каталогът, входът и всичко лично не се измерват.",
    clarityEnabled:
      "Microsoft Clarity е включен за това внедряване и се стартира след съгласие.",
    clarityDisabled: "Microsoft Clarity е изключен за това внедряване.",
    allow: "Разрешаване на анализи",
    turnOff: "Изключване",
    technicalSummary: "Как се пази изборът ви",
    preferenceKey: "Ключ на настройката:",
    preferenceDescription:
      "Изключването спира бъдещото зареждане на Google Tag Manager / Google Analytics и оттегля достъпа на Microsoft Clarity до аналитичното хранилище за текущата страница, ако Clarity вече е стартиран.",
  },
  marketing: {
    title: "Маркетингово измерване с Meta",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Разрешено",
      declined: "Изключено",
      undecided: "Не е избрано",
      deploymentOff: "Изключено за това внедряване",
    },
    description:
      "Когато функцията е включена и изрично разрешена, OverGarden може да изпраща към Meta Ads само разрешени класове събития, например преглед на публична целева страница или публикуване на първия запис. Не се изпращат текст от дневник, лични имена на растения, избори от каталога, точно местоположение, ключове за медии, данни от обратно извикване при вход, имейли, идентификатори на акаунт, бисквитки, IP адрес или данни за user-agent.",
    allow: "Разрешаване на маркетингово измерване",
    turnOff: "Изключване",
    technicalSummary: "Как се пази изборът ви",
    preferenceKey: "Ключ на настройката:",
    preferenceDescription:
      "Изключването отменя бъдещи събития от Meta Pixel в браузъра и спира OverGarden да поставя на опашка събития за Meta Conversions API от този браузър.",
    consentLabel: "Съгласие за маркетингово измерване с Meta",
    consentMessage:
      "OverGarden може да измерва посещения от реклами в Meta само с ваше разрешение. Измерването работи единствено на публични, правни и помощни страници и изпраща само разрешени класове събития — никога личен текст от градината, точно местоположение, медии, данни за вход или идентификатори на акаунт.",
    keepOff: "Без разрешение",
  },
  supportTitle: "Поддръжка и въпроси за поверителност",
  privacyTitle: "Уведомление за поверителност",
} as const;

const RU = {
  signOut: {
    action: "Выйти из аккаунта",
    accountSectionTitle: "Аккаунт и безопасность",
    accountSectionDescription:
      "Завершите доступ к этому саду в текущем браузере. Ваш аккаунт, роль и данные на сервере останутся без изменений.",
    accountMenuTitle: "Аккаунт",
    accountMenuDescription:
      "Откройте настройки профиля или безопасно завершите текущий сеанс.",
    openAccountMenu: "Открыть меню аккаунта",
    closeAccountMenu: "Закрыть меню аккаунта",
    openProfile: "Открыть мой профиль",
    operatorRegionLabel: "Управление текущим сеансом",
    backToGarden: "К моему саду",
    checking: "Проверяем локальные изменения…",
    servedUnresolved:
      "Не удалось повторно подтвердить сеанс. Показываем уже открытый сервером сад в ограниченном режиме; каждое изменение проверяется отдельно.",
    confirmationTitle: "Завершить сеанс?",
    confirmationDescription:
      "До успешной публикации текст остаётся только в открытой вкладке. Черновики не сохраняются; выход, закрытие или перезагрузка вкладки удалит неопубликованные изменения.",
    confirmationCancel: "Остаться в аккаунте",
    confirmationAction: "Выйти",
    errorTitle: "Не удалось безопасно завершить сеанс",
    localCheckError:
      "Не удалось проверить локальные изменения. Ничего не удалено, и вы остаётесь в аккаунте.",
    fallbackExitDescription:
      "До успешной публикации текст остаётся только в открытой вкладке. Черновики не сохраняются; выход, закрытие или перезагрузка вкладки удалит неопубликованные изменения.",
    fallbackExitAction: "Выйти",
    fallbackExitPending: "Завершаем сеанс…",
    fallbackExitUnconfirmedError:
      "Не удалось подтвердить выход. Попробуйте ещё раз.",
    blockedAccountMethodsRegionLabel: "Управление способами входа",
    blockedAccountMethodsDescription:
      "Сад пока недоступен, но вы можете безопасно изменить способ входа.",
    blockedAccountMethodsAction: "Управление способами входа",
    blockedAccountMethodsPending: "Проверяем способы входа…",
    blockedAccountErasureAction: "Отправить запрос на удаление данных",
    blockedAccountMethodsUnavailable:
      "Не удалось безопасно проверить способы входа. Ничего не изменено. Попробуйте ещё раз или выйдите из аккаунта.",
    blockedAccountMethodsServedUnresolved:
      "Не удалось повторно подтвердить способы входа. Показываем ограниченное состояние без изменения данных.",
    retry: "Попробовать ещё раз",
    reloadAndRecheck: "Перезагрузить и проверить сеанс",
  },
  analyticsConsent: {
    label: "Согласие на аналитику",
    message:
      "Разрешите Google измерять посещения главной, статей и справочных страниц?",
    messageWithClarity:
      "Разрешите Google и Microsoft измерять посещения главной, статей и справочных страниц?",
    details: "Подробнее",
    accept: "Разрешить",
    decline: "Не разрешать",
  },
  analytics: {
    title: "Публичная аналитика",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Разрешена",
      declined: "Выключена",
      undecided: "Не выбрано",
    },
    description:
      "После вашего разрешения Google Analytics и Microsoft Clarity измеряют посещения только главной страницы, статей (блог, ответы, руководства, рынки) и страниц о конфиденциальности, поддержке и первой публикации. Сад, записи садоводов, профили, каталог, вход и всё личное не измеряются.",
    clarityEnabled:
      "Microsoft Clarity включён для этого развёртывания и запускается после согласия.",
    clarityDisabled: "Microsoft Clarity выключен для этого развёртывания.",
    allow: "Разрешить аналитику",
    turnOff: "Выключить",
    technicalSummary: "Как хранится ваш выбор",
    preferenceKey: "Ключ настройки:",
    preferenceDescription:
      "Выключение прекращает будущую загрузку Google Tag Manager / Google Analytics и отзывает доступ Microsoft Clarity к аналитическому хранилищу для текущей страницы, если Clarity уже инициализирован.",
  },
  marketing: {
    title: "Маркетинговые измерения Meta",
    statusPrefix: "Статус:",
    statuses: {
      accepted: "Разрешены",
      declined: "Выключены",
      undecided: "Не выбрано",
      deploymentOff: "Выключены для этого развёртывания",
    },
    description:
      "Когда функция включена и пользователь явно согласился, OverGarden может отправлять в Meta Ads только разрешённые классы событий, например просмотр публичной целевой страницы или сохранение первой личной записи. OverGarden не отправляет текст журнала, личные названия растений, выбор каталога, точное местоположение, ключи медиа, данные обратного вызова входа, адреса электронной почты, идентификаторы аккаунта, файлы cookie, IP-адрес или данные user-agent.",
    allow: "Разрешить маркетинговые измерения",
    turnOff: "Выключить",
    technicalSummary: "Как хранится ваш выбор",
    preferenceKey: "Ключ настройки:",
    preferenceDescription:
      "Выключение отзывает будущие события браузерного Meta Pixel и запрещает OverGarden ставить в очередь события Meta Conversions API из этого браузера.",
    consentLabel: "Согласие на маркетинговые измерения Meta",
    consentMessage:
      "OverGarden может измерять переходы из рекламы Meta только с вашего разрешения. Измерения работают лишь на публичных, юридических страницах и страницах поддержки и отправляют только разрешённые классы событий — никогда не личный текст сада, точное местоположение, медиа, данные входа или идентификаторы аккаунта.",
    keepOff: "Не разрешать",
  },
  supportTitle: "Поддержка и вопросы конфиденциальности",
  privacyTitle: "Уведомление о конфиденциальности",
} as const;

type Widen<T> = T extends string
  ? string
  : T extends object
    ? { readonly [Key in keyof T]: Widen<T[Key]> }
    : T;

export type TrustClientCopy = Widen<typeof UK>;

/**
 * Per language, with each sentence's literal type kept: `trust-surface-copy.ts`
 * and `public-surface-localization.ts` compose their sections from these.
 */
export const TRUST_CLIENT = { uk: UK, bg: BG, ru: RU } as const;

const TRUST_CLIENT_COPY: Record<InterfaceLocale, TrustClientCopy> =
  TRUST_CLIENT;

export function getTrustClientCopy(locale: InterfaceLocale): TrustClientCopy {
  return TRUST_CLIENT_COPY[locale];
}
