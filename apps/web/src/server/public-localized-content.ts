import "server-only";

import {
  BLOG_INDEX_PATH,
  type AnswerFaq,
  type AnswerPageContent,
  type BlogPostContent,
  type GuideContent,
  type GuideStep,
  type MarketLandingContent,
  type PublicContentLink,
  getAnswerPage,
  getBlogPost,
  getGuide,
  getMarketLanding,
  isMarketLandingAvailableInLocale,
  listAnswerPages,
  listAvailableMarketLandingLocales,
  listBlogPosts,
  listGuides,
  listMarketLandings,
} from "@/server/public-seo-content";
import type { PublicLocale } from "@/lib/public-localization";
import type { PublicHomeFeedCopy } from "@/components/public/public-home-feed";

export interface LocalizedHomeContent {
  title: string;
  description: string;
  feed: PublicHomeFeedCopy;
}

export interface LocalizedBlogIndexContent {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  startTitle: string;
  startBody: string;
  readNoteCta: string;
  workspaceCta: string;
}

export interface LocalizedRouteChrome {
  fieldNotesBack: string;
  guideEyebrow: string;
  answerEyebrow: string;
  conciseAnswerTitle: string;
  proofDetailsTitle: string;
  relatedVarietiesTitle: string;
  relatedTopicsTitle: string;
  faqTitle: string;
  recordPlantCta: string;
  relatedPathsTitle: string;
  nextStepTitle: string;
  marketEyebrow: string;
  marketAudienceTitle: string;
  marketPromiseTitle: string;
  marketProofTitle: string;
  privateRecordCta: string;
}

const HOME_CONTENT: Record<PublicLocale, LocalizedHomeContent> = {
  uk: {
    title: "OverGarden",
    description:
      "Читайте реальні публічні журнали рослин, тварин і бджолиних сімей без реєстрації.",
    feed: {
      heading: "Стрічка",
      filterLabel: "Фільтрувати стрічку",
      recentFilter: "Останні",
      followedFilter: "Підписки",
      plantFilter: "Рослини",
      animalFilter: "Тварини",
      topicFilterLabel: "Перевірені теми",
      readEntry: "Читати запис",
      publishedBy: "Автор",
      safeRegion: "Регіон",
      loadMore: "Наступна сторінка",
      endOfFeed: "Усі доступні записи переглянуто",
      emptyTitle: "Тут поки немає публічних записів",
      emptyBody:
        "Змініть фільтр або перейдіть до перевірених матеріалів OverGarden. Реєстрація для читання не потрібна.",
      emptyPrimary: "Скинути фільтри",
      emptySecondary: "Відкрити знання",
      loadingLabel: "Завантаження публічних журналів",
      errorTitle: "Стрічку не вдалося завантажити",
      errorBody:
        "Спробуйте ще раз або продовжуйте читати перевірені матеріали OverGarden.",
      retry: "Спробувати ще раз",
      trustedTopicsTitle: "Перевірені теми",
      trustedTopicsEmpty: "Поки немає тем із перевіреним публічним доказом.",
      knowledgeTitle: "Корисне поруч",
      guideLabel: "Як почати живий журнал",
      answerLabel: "Чому жовтіє листя томатів",
      kindLabels: {
        plant: "Рослина",
        animal: "Тварина",
      },
    },
  },
  bg: {
    title: "OverGarden",
    description:
      "Четете реални публични дневници за растения, животни и пчелни семейства без регистрация.",
    feed: {
      heading: "Поток",
      filterLabel: "Филтриране на потока",
      recentFilter: "Последни",
      followedFilter: "Следвани",
      plantFilter: "Растения",
      animalFilter: "Животни",
      topicFilterLabel: "Проверени теми",
      readEntry: "Прочетете записа",
      publishedBy: "Автор",
      safeRegion: "Регион",
      loadMore: "Следваща страница",
      endOfFeed: "Прегледахте всички налични записи",
      emptyTitle: "Все още няма публични записи тук",
      emptyBody:
        "Сменете филтъра или отворете проверените материали на OverGarden. За четене не е нужна регистрация.",
      emptyPrimary: "Изчистване на филтрите",
      emptySecondary: "Отваряне на знанията",
      loadingLabel: "Зареждане на публичните дневници",
      errorTitle: "Потокът не може да се зареди",
      errorBody:
        "Опитайте отново или продължете с проверените материали на OverGarden.",
      retry: "Опитайте отново",
      trustedTopicsTitle: "Проверени теми",
      trustedTopicsEmpty:
        "Все още няма теми с проверени публични доказателства.",
      knowledgeTitle: "Полезно наблизо",
      guideLabel: "Как да започнете жив дневник",
      answerLabel: "Защо листата на доматите пожълтяват",
      kindLabels: {
        plant: "Растение",
        animal: "Животно",
      },
    },
  },
  ru: {
    title: "OverGarden",
    description:
      "Читайте реальные публичные журналы растений, животных и пчелиных семей без регистрации.",
    feed: {
      heading: "Лента",
      filterLabel: "Фильтровать ленту",
      recentFilter: "Последние",
      followedFilter: "Подписки",
      plantFilter: "Растения",
      animalFilter: "Животные",
      topicFilterLabel: "Проверенные темы",
      readEntry: "Читать запись",
      publishedBy: "Автор",
      safeRegion: "Регион",
      loadMore: "Следующая страница",
      endOfFeed: "Все доступные записи просмотрены",
      emptyTitle: "Здесь пока нет публичных записей",
      emptyBody:
        "Измените фильтр или откройте проверенные материалы OverGarden. Для чтения регистрация не нужна.",
      emptyPrimary: "Сбросить фильтры",
      emptySecondary: "Открыть знания",
      loadingLabel: "Загрузка публичных журналов",
      errorTitle: "Не удалось загрузить ленту",
      errorBody:
        "Попробуйте ещё раз или продолжайте читать проверенные материалы OverGarden.",
      retry: "Попробовать ещё раз",
      trustedTopicsTitle: "Проверенные темы",
      trustedTopicsEmpty:
        "Пока нет тем с проверенными публичными доказательствами.",
      knowledgeTitle: "Полезное рядом",
      guideLabel: "Как начать живой журнал",
      answerLabel: "Почему желтеют листья томатов",
      kindLabels: {
        plant: "Растение",
        animal: "Животное",
      },
    },
  },
};

const KNOWLEDGE_EDITORIAL_META: Record<
  PublicLocale,
  { author: string; guideSource: string; answerSource: string }
> = {
  uk: {
    author: "Редакція OverGarden",
    guideSource: "Продуктові й приватнісні принципи OverGarden",
    answerSource: "Підхід OverGarden до журналу з перевірюваним досвідом",
  },
  bg: {
    author: "Редакция OverGarden",
    guideSource:
      "Продуктови принципи и принципи за поверителност на OverGarden",
    answerSource: "Подходът на OverGarden към дневник с проверим опит",
  },
  ru: {
    author: "Редакция OverGarden",
    guideSource:
      "Продуктовые принципы и принципы конфиденциальности OverGarden",
    answerSource: "Подход OverGarden к журналу с проверяемым опытом",
  },
};

const BLOG_INDEX_CONTENT: Record<PublicLocale, LocalizedBlogIndexContent> = {
  uk: {
    title: "Нотатки OverGarden",
    description:
      "Авторські нотатки OverGarden про живі записи рослин, публічний доказ і безпечне пошукове відкриття.",
    eyebrow: "Нотатки",
    heading: "Корисні публічні сторінки перед тонкими публічними сторінками.",
    intro:
      "OverGarden починає пошукове відкриття з авторських сторінок, побудованих навколо доказу. Публічні журнали й агрегації отримують індексацію лише тоді, коли стають безпечними й корисними самі по собі.",
    startTitle: "Почніть з одного запису",
    startBody:
      "Публічні сторінки можна читати без акаунта, але збереження рослини все ще відбувається в автентифікованому робочому просторі.",
    readNoteCta: "Читати нотатку",
    workspaceCta: "Відкрити простір",
  },
  bg: {
    title: "Бележки на OverGarden",
    description:
      "Авторски бележки на OverGarden за живи записи на растения, публично доказателство и безопасно откриване през търсене.",
    eyebrow: "Бележки",
    heading: "Полезни публични страници преди тънки публични страници.",
    intro:
      "OverGarden започва откриването през търсене с авторски страници около доказателства. Публичните журнали и агрегации се индексират по-късно, когато са безопасни и полезни сами по себе си.",
    startTitle: "Започнете с един запис",
    startBody:
      "Посетителят може да чете тези страници, но запазването на растение остава в защитеното работно място.",
    readNoteCta: "Прочетете бележката",
    workspaceCta: "Отворете работното място",
  },
  ru: {
    title: "Заметки OverGarden",
    description:
      "Авторские заметки OverGarden о живых записях растений, публичном доказательстве и безопасном поисковом обнаружении.",
    eyebrow: "Заметки",
    heading:
      "Сначала полезные публичные страницы, потом тонкие публичные страницы.",
    intro:
      "OverGarden начинает поисковое обнаружение с авторских страниц, построенных вокруг доказательства. Публичные журналы и агрегации индексируются позже, когда они безопасны и полезны сами по себе.",
    startTitle: "Начните с одной записи",
    startBody:
      "Посетитель может читать эти страницы, но сохранение растения остается в защищенном рабочем пространстве.",
    readNoteCta: "Читать заметку",
    workspaceCta: "Открыть пространство",
  },
};

const ROUTE_CHROME: Record<PublicLocale, LocalizedRouteChrome> = {
  uk: {
    fieldNotesBack: "Нотатки",
    guideEyebrow: "Посібник",
    answerEyebrow: "Відповідь",
    conciseAnswerTitle: "Коротка відповідь",
    proofDetailsTitle: "Що записати як доказ",
    relatedVarietiesTitle: "Пов'язані сорти",
    relatedTopicsTitle: "Пов'язані теми",
    faqTitle: "Поширені питання",
    recordPlantCta: "Записати свою рослину",
    relatedPathsTitle: "Пов'язані шляхи",
    nextStepTitle: "Наступний корисний крок",
    marketEyebrow: "Ринкова сторінка",
    marketAudienceTitle: "Для кого це",
    marketPromiseTitle: "Обіцянка",
    marketProofTitle:
      "Що публічний discovery може безпечно використовувати зараз",
    privateRecordCta: "Почати приватний запис",
  },
  bg: {
    fieldNotesBack: "Бележки",
    guideEyebrow: "Ръководство",
    answerEyebrow: "Отговор",
    conciseAnswerTitle: "Кратък отговор",
    proofDetailsTitle: "Какво да запишете като доказателство",
    relatedVarietiesTitle: "Свързани сортове",
    relatedTopicsTitle: "Свързани теми",
    faqTitle: "Често задавани въпроси",
    recordPlantCta: "Запишете своето растение",
    relatedPathsTitle: "Свързани пътеки",
    nextStepTitle: "Следваща полезна стъпка",
    marketEyebrow: "Пазарна страница",
    marketAudienceTitle: "За кого е",
    marketPromiseTitle: "Обещанието",
    marketProofTitle:
      "Какво публичното откриване може да използва безопасно сега",
    privateRecordCta: "Започнете личен запис",
  },
  ru: {
    fieldNotesBack: "Заметки",
    guideEyebrow: "Руководство",
    answerEyebrow: "Ответ",
    conciseAnswerTitle: "Краткий ответ",
    proofDetailsTitle: "Что записать как доказательство",
    relatedVarietiesTitle: "Связанные сорта",
    relatedTopicsTitle: "Связанные темы",
    faqTitle: "Частые вопросы",
    recordPlantCta: "Записать свое растение",
    relatedPathsTitle: "Связанные пути",
    nextStepTitle: "Следующий полезный шаг",
    marketEyebrow: "Рыночная страница",
    marketAudienceTitle: "Для кого это",
    marketPromiseTitle: "Обещание",
    marketProofTitle:
      "Что публичное обнаружение может безопасно использовать сейчас",
    privateRecordCta: "Начать приватную запись",
  },
};

const BLOG_POST_TRANSLATIONS: Record<
  PublicLocale,
  Record<string, Partial<BlogPostContent>>
> = {
  uk: {
    "ai-garden-advice-vs-real-garden-proof": {
      title: "Порада AI - це не те саме, що датований садовий доказ",
      description:
        "Чому OverGarden починає з живих записів рослин перед публічними рекомендаціями.",
      excerpt:
        "Загальна відповідь може бути корисною, але датований запис про реальну рослину є шаром доказу, який садівники можуть порівнювати сезон за сезоном.",
      sections: [
        {
          heading: "Порада зникає. Записи накопичуються.",
          body: "Відповідь у чаті може пояснити, що мало б спрацювати. Датований запис рослини показує, що змінилося, коли це сталося і чи повернувся садівник після першої дії. Саме цю історію OverGarden захищає перед будь-якою публікацією.",
        },
        {
          heading: "Публічні сторінки мають заслужити довіру до трафіку.",
          body: "OverGarden не індексує порожні каталожні стаби або приватні журнали як пошукову приманку. Публічне відкриття починається з авторських сторінок і розширюється лише тоді, коли реальні публічні записи та безпечні пороги агрегації роблять сторінку самодостатньо корисною.",
        },
        {
          heading: "Перша продуктова дія приватна.",
          body: "Найбезпечніший шлях для садівника простий: вибрати один живий об'єкт, зберегти одне спостереження і повернутися до того самого об'єкта, коли щось зміниться. Публікація є пізнішим явним вибором, а не ціною ведення запису.",
        },
      ],
      relatedLinks: [
        {
          label: "Почати приватний запис рослини",
          href: "/garden",
          description:
            "Відкрити захищений простір і зберегти перше датоване спостереження.",
        },
        {
          label: "Прочитати стартовий гайд",
          href: "/guides/start-a-living-plant-record",
          description:
            "Мінімальний процес запису однієї рослини без перетворення саду на таблицю.",
        },
      ],
    },
  },
  bg: {
    "ai-garden-advice-vs-real-garden-proof": {
      title: "AI съветът не е същото като датирано градинско доказателство",
      description:
        "Защо OverGarden започва с живи записи на растения преди публични препоръки.",
      excerpt:
        "Общият отговор може да е полезен, но датиран запис за реално растение е доказателственият слой, който градинарите могат да сравняват сезон след сезон.",
      sections: [
        {
          heading: "Съветът изчезва. Записите се натрупват.",
          body: "Отговорът в чат може да обясни какво би трябвало да работи. Датираният запис на растение показва какво се е променило, кога се е случило и дали градинарят се е върнал след първото действие. Тази история е полезната част, която OverGarden пази преди публикация.",
        },
        {
          heading:
            "Публичните страници трябва да спечелят доверие преди трафик.",
          body: "OverGarden няма да индексира празни каталожни страници или лични журнали като търсаческа примамка. Публичното откриване започва с авторски страници и се разширява само когато реални публични записи и безопасни прагове правят страницата полезна сама по себе си.",
        },
        {
          heading: "Първото продуктово действие е лично.",
          body: "Най-безопасният път за градинаря е прост: изберете един жив обект, запазете едно наблюдение и се върнете към същия обект, когато нещо се промени. Публикуването е по-късен ясен избор, не цената на водене на запис.",
        },
      ],
      relatedLinks: [
        {
          label: "Започнете личен запис на растение",
          href: "/garden",
          description:
            "Отворете защитеното работно място и запазете първото датирано наблюдение.",
        },
        {
          label: "Прочетете стартовия гайд",
          href: "/guides/start-a-living-plant-record",
          description:
            "Минимален процес за запис на едно растение без градината да стане таблица.",
        },
      ],
    },
  },
  ru: {
    "ai-garden-advice-vs-real-garden-proof": {
      title:
        "Совет AI - не то же самое, что датированное садовое доказательство",
      description:
        "Почему OverGarden начинает с живых записей растений до публичных рекомендаций.",
      excerpt:
        "Общий ответ может быть полезным, но датированная запись о реальном растении - это слой доказательства, который садоводы могут сравнивать сезон за сезоном.",
      sections: [
        {
          heading: "Совет исчезает. Записи накапливаются.",
          body: "Ответ в чате может объяснить, что должно сработать. Датированная запись растения показывает, что изменилось, когда это произошло и вернулся ли садовод после первого действия. Именно эту историю OverGarden защищает до любой публикации.",
        },
        {
          heading: "Публичные страницы должны заслужить доверие до трафика.",
          body: "OverGarden не индексирует пустые каталожные заготовки или приватные журналы как поисковую приманку. Публичное обнаружение начинается с авторских страниц и расширяется только тогда, когда реальные публичные записи и безопасные пороги агрегации делают страницу полезной самой по себе.",
        },
        {
          heading: "Первое продуктовое действие приватное.",
          body: "Самый безопасный путь для садовода прост: выбрать один живой объект, сохранить одно наблюдение и вернуться к тому же объекту, когда что-то изменится. Публикация - более поздний явный выбор, а не цена ведения записи.",
        },
      ],
      relatedLinks: [
        {
          label: "Начать приватную запись растения",
          href: "/garden",
          description:
            "Открыть защищенное рабочее пространство и сохранить первое датированное наблюдение.",
        },
        {
          label: "Прочитать стартовый гайд",
          href: "/guides/start-a-living-plant-record",
          description:
            "Минимальный процесс записи одного растения без превращения сада в таблицу.",
        },
      ],
    },
  },
};

const GUIDE_TRANSLATIONS: Record<
  PublicLocale,
  Record<string, Partial<GuideContent>>
> = {
  uk: {
    "start-a-living-plant-record": {
      title: "Як почати живий запис рослини",
      description:
        "Практичний перший процес в OverGarden: одна рослина, одна датована нотатка і одне повернення.",
      outcome:
        "Наприкінці садівник має один збережений об'єкт рослини і перше спостереження, яке можна порівняти пізніше.",
      steps: [
        {
          title: "Виберіть одну рослину, не весь сад",
          body: "Почніть із рослини, яку буде легко впізнати знову: балконний томат, грядка огірків, вазон базиліку або молоде дерево. Одного об'єкта достатньо для першого запису.",
        },
        {
          title: "Напишіть, що змінилося сьогодні",
          body: "Пишіть звичайними словами: зійшло, переніс надвір, перша квітка, жовті нижні листки, перший урожай. Дата й ідентичність рослини важливіші за відшліфований текст.",
        },
        {
          title: "Додавайте фото лише коли воно допоможе порівнянню",
          body: "Фото корисне, коли показує видимий етап або проблему. OverGarden показує публічно лише оброблені копії без фото-метаданих.",
        },
        {
          title: "Поверніться до того самого об'єкта",
          body: "Другий запис - момент, коли історія починає ставати доказом. Він показує, чи рослина відновилася, погіршилася, зацвіла, дала плоди або просто пережила сезон.",
        },
      ],
      relatedLinks: [
        {
          label: "Відкрити простір",
          href: "/garden",
          description: "Створити перший приватний запис за auth gate.",
        },
        {
          label: "Чому доказ сильніший за загальну пораду",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description:
            "Позиціонування, на якому тримається public discovery OverGarden.",
        },
      ],
    },
  },
  bg: {
    "start-a-living-plant-record": {
      title: "Как да започнете жив запис на растение",
      description:
        "Практичен първи процес в OverGarden: едно растение, една датирана бележка и едно връщане.",
      outcome:
        "Накрая градинарят има един запазен растителен обект и първо наблюдение, което може да сравни по-късно.",
      steps: [
        {
          title: "Изберете едно растение, не цялата градина",
          body: "Започнете с растение, което лесно ще разпознаете отново: домат на тераса, леха с краставици, саксия с босилек или младо дърво. Един обект стига за първия запис.",
        },
        {
          title: "Напишете какво се промени днес",
          body: "Използвайте обикновени думи: поникна, изнесено навън, първи цвят, жълти долни листа, първа реколта. Датата и идентичността на растението са по-важни от идеален текст.",
        },
        {
          title: "Добавете снимка само когато помага за сравнение",
          body: "Снимката е полезна, когато показва видим етап или проблем. OverGarden показва публично само обработени копия без фото метаданни.",
        },
        {
          title: "Върнете се към същия обект",
          body: "Вторият запис е моментът, в който историята започва да става доказателство. Той показва дали растението се възстановява, влошава, цъфти, връзва или просто оцелява сезона.",
        },
      ],
      relatedLinks: [
        {
          label: "Отворете работното място",
          href: "/garden",
          description: "Създайте първия личен запис зад auth gate.",
        },
        {
          label: "Защо доказателството е по-силно от общ съвет",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description: "Позиционирането зад публичното откриване в OverGarden.",
        },
      ],
    },
  },
  ru: {
    "start-a-living-plant-record": {
      title: "Как начать живую запись растения",
      description:
        "Практичный первый процесс в OverGarden: одно растение, одна датированная заметка и одно возвращение.",
      outcome:
        "В конце у садовода есть один сохраненный объект растения и первое наблюдение, которое можно сравнить позже.",
      steps: [
        {
          title: "Выберите одно растение, не весь сад",
          body: "Начните с растения, которое легко узнать снова: балконный томат, грядка огурцов, горшок базилика или молодое дерево. Одного объекта достаточно для первой записи.",
        },
        {
          title: "Напишите, что изменилось сегодня",
          body: "Используйте обычные слова: взошло, вынесено наружу, первый цветок, желтые нижние листья, первый урожай. Дата и идентичность растения важнее отполированного текста.",
        },
        {
          title: "Добавляйте фото только когда оно помогает сравнению",
          body: "Фото полезно, когда показывает видимый этап или проблему. OverGarden публично показывает только обработанные копии без фото-метаданных.",
        },
        {
          title: "Вернитесь к тому же объекту",
          body: "Вторая запись - момент, когда история начинает становиться доказательством. Она показывает, восстановилось ли растение, ухудшилось, зацвело, дало плоды или просто пережило сезон.",
        },
      ],
      relatedLinks: [
        {
          label: "Открыть пространство",
          href: "/garden",
          description: "Создать первую приватную запись за auth gate.",
        },
        {
          label: "Почему доказательство сильнее общей рекомендации",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description:
            "Позиционирование, на котором держится public discovery OverGarden.",
        },
      ],
    },
  },
};

const ANSWER_TRANSLATIONS: Record<
  PublicLocale,
  Record<string, Partial<AnswerPageContent>>
> = {
  uk: {
    "why-are-tomato-leaves-yellow": {
      question: "Чому жовтіє листя томатів?",
      title: "Чому жовтіє листя томатів?",
      description:
        "Коротка діагностична відповідь і план перевірюваних спостережень для жовтіння листя томатів.",
      conciseAnswer:
        "Листя томатів часто жовтіє через водний стрес, поганий дренаж, старіння нижніх листків, дисбаланс живлення або стрес коренів. Найшвидша корисна дія - записати, де почалося жовтіння, чи грунт лишається мокрим або сухим, і що зміниться за кілька днів.",
      proofDetails: [
        "Запишіть, де почалося жовтіння: нижні листки, новий приріст або вся рослина.",
        "Зафіксуйте полив, дренаж контейнера і чи рослину нещодавно перенесли надвір або на сильніше сонце.",
        "Додайте одне датоване фото для порівняння, потім поверніться до тієї самої рослини після наступного циклу поливу.",
        "Публічна версія має бути на рівні регіону або прихована; точні координати не публікуються.",
      ],
      relatedVarieties: [
        {
          label: "Томати",
          href: "/garden",
          description:
            "Почніть датований запис для томата, який ви справді вирощуєте.",
        },
        {
          label: "Балконні овочі",
          href: "/markets/ukraine",
          description:
            "Подивіться, як OverGarden описує перші записи для садівників в Україні.",
        },
      ],
      relatedTopics: [
        {
          label: "Перший запис рослини",
          href: "/guides/start-a-living-plant-record",
          description:
            "Мінімальна структура запису, потрібна перед тим, як діагноз стане порівнюваним.",
        },
        {
          label: "Доказ замість одноразової поради",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description:
            "Чому OverGarden вважає датований follow-up корисним публічним шаром.",
        },
      ],
      faqs: [
        {
          question: "Чи варто одразу публікувати фото проблеми?",
          answer:
            "Ні. Спершу збережіть приватний запис. Публікуйте пізніше лише якщо самі вирішите, після очищення фото і без приватної локації чи ідентифікаційних деталей у тексті.",
        },
        {
          question: "Яка деталь найважливіша при жовтінні листя?",
          answer:
            "Найважливіша динаміка: де жовтіння почалося, що змінилося перед цим і чи рослина покращилась після наступної дії.",
        },
        {
          question: "Чи OverGarden сам діагностує рослину?",
          answer:
            "Поточна версія OverGarden не обіцяє автоматичну діагностику. Вона створює чистий запис, щоб садівник міг порівнювати ту саму рослину в часі і згодом додати корисний публічний доказ.",
        },
      ],
    },
  },
  bg: {
    "why-are-tomato-leaves-yellow": {
      question: "Защо листата на доматите пожълтяват?",
      title: "Защо листата на доматите пожълтяват?",
      description:
        "Кратък диагностичен отговор и план за проверими наблюдения при пожълтяване на доматени листа.",
      conciseAnswer:
        "Листата на доматите често пожълтяват от воден стрес, лош дренаж, стари долни листа, хранителен дисбаланс или стрес на корените. Най-бързата полезна стъпка е да запишете откъде започва пожълтяването, дали почвата стои мокра или суха и какво се променя след няколко дни.",
      proofDetails: [
        "Запишете дали пожълтяването започва от долните листа, новия растеж или цялото растение.",
        "Отбележете поливане, дренаж на контейнера и дали растението скоро е преместено навън или на по-силно слънце.",
        "Добавете една датирана снимка за сравнение, после се върнете към същото растение след следващия цикъл на поливане.",
        "Публичната версия трябва да е на регионално ниво или скрита; точни координати не се публикуват.",
      ],
      relatedVarieties: [
        {
          label: "Домати",
          href: "/garden",
          description:
            "Започнете датиран запис за домата, който реално отглеждате.",
        },
        {
          label: "Зеленчуци на тераса",
          href: "/markets/bulgaria",
          description:
            "Вижте как OverGarden рамкира първите записи за градинари в България.",
        },
      ],
      relatedTopics: [
        {
          label: "Първи запис на растение",
          href: "/guides/start-a-living-plant-record",
          description:
            "Минималната структура на запис, преди диагнозата да стане сравнима.",
        },
        {
          label: "Доказателство вместо еднократен съвет",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description:
            "Защо OverGarden третира датираното връщане като полезен публичен слой.",
        },
      ],
      faqs: [
        {
          question: "Трябва ли веднага да публикувам снимка на проблема?",
          answer:
            "Не. Първо запазете личния запис. Публикувайте по-късно само ако решите, след като снимката има почистено публично копие и бележката не съдържа лична локация или идентифициращи детайли.",
        },
        {
          question: "Кой детайл е най-важен при пожълтяване?",
          answer:
            "Най-важен е моделът във времето: откъде започва, какво се е променило преди това и дали растението се подобрява след следващото действие.",
        },
        {
          question: "OverGarden сам ли диагностицира растението?",
          answer:
            "Текущата версия на OverGarden не обещава автоматична диагностика. Тя създава чист запис, за да може градинарят да сравнява същото растение през дните и по-късно да допринесе с публично доказателство.",
        },
      ],
    },
  },
  ru: {
    "why-are-tomato-leaves-yellow": {
      question: "Почему желтеют листья томатов?",
      title: "Почему желтеют листья томатов?",
      description:
        "Краткий диагностический ответ и план проверяемых наблюдений при пожелтении листьев томатов.",
      conciseAnswer:
        "Листья томатов часто желтеют из-за водного стресса, плохого дренажа, старых нижних листьев, дисбаланса питания или стресса корней. Самый быстрый полезный шаг - записать, где началось пожелтение, остается ли почва мокрой или сухой, и что изменится через несколько дней.",
      proofDetails: [
        "Запишите, начинается ли пожелтение с нижних листьев, нового роста или всего растения.",
        "Зафиксируйте полив, дренаж контейнера и не переносили ли растение недавно наружу или на более сильное солнце.",
        "Добавьте одно датированное фото для сравнения, затем вернитесь к тому же растению после следующего цикла полива.",
        "Публичная версия должна быть на уровне региона или скрыта; точные координаты не публикуются.",
      ],
      relatedVarieties: [
        {
          label: "Томаты",
          href: "/garden",
          description:
            "Начните датированную запись для томата, который вы действительно выращиваете.",
        },
        {
          label: "Балконные овощи",
          href: "/markets/bulgaria",
          description:
            "Посмотрите, как OverGarden описывает первые записи для садоводов в Болгарии.",
        },
      ],
      relatedTopics: [
        {
          label: "Первая запись растения",
          href: "/guides/start-a-living-plant-record",
          description:
            "Минимальная структура записи перед тем, как диагноз станет сравнимым.",
        },
        {
          label: "Доказательство вместо одноразового совета",
          href: "/blog/ai-garden-advice-vs-real-garden-proof",
          description:
            "Почему OverGarden считает датированный follow-up полезным публичным слоем.",
        },
      ],
      faqs: [
        {
          question: "Стоит ли сразу публиковать фото проблемы?",
          answer:
            "Нет. Сначала сохраните приватную запись. Публикуйте позже только если сами решите, после очищенной публичной копии фото и без личной локации или идентифицирующих деталей в тексте.",
        },
        {
          question: "Какая деталь важнее всего при пожелтении листьев?",
          answer:
            "Важнее всего динамика: где пожелтение началось, что изменилось до этого и улучшилось ли растение после следующего действия.",
        },
        {
          question: "OverGarden сам диагностирует растение?",
          answer:
            "Текущая версия OverGarden не обещает автоматическую диагностику. Она создает чистую запись, чтобы садовод мог сравнить одно и то же растение по дням и позже внести полезное публичное доказательство.",
        },
      ],
    },
  },
};

const MARKET_TRANSLATIONS: Record<
  PublicLocale,
  Partial<Record<MarketLandingContent["market"], Partial<MarketLandingContent>>>
> = {
  uk: {
    ukraine: {
      title: "OverGarden для садівників в Україні",
      description:
        "Публічна сторінка для українських садівників, яким потрібен приватний спершу запис рослини і необов'язковий публічний доказ.",
      localAudience:
        "Садівники, які вирощують на балконах, дачах, сільських ділянках, у теплицях і малих господарських просторах України.",
      promise:
        "Спершу ведіть живий запис, а потім вирішуйте, що стане публічним доказом без розкриття точного місця.",
      proofPlan: [
        "Приватний перший запис і follow-up того самого об'єкта залишаються ядром активації.",
        "Публічні сторінки зараз використовують авторські матеріали, а реальні записи з'являються лише після явної публікації.",
        "Локація лишається прихованою або тільки на рівні грубого регіону; точні координати не входять у продуктові поверхні.",
      ],
    },
    bulgaria: {
      title: "OverGarden для садівників у Болгарії",
      description:
        "Публічна сторінка для болгарських садівників з приватним спершу записом рослини і необов'язковим публічним доказом.",
      localAudience:
        "Садівники в садах, дворах, теплицях, на терасах, віллах і малих господарських просторах Болгарії.",
      promise:
        "Спершу ведіть живий запис, а потім вирішуйте, що стане публічним доказом без розкриття точного місця.",
      proofPlan: [
        "Приватний перший запис і follow-up того самого об'єкта залишаються ядром активації.",
        "Ринковий контент починається авторським і вузьким, доки реальні публічні записи не зроблять агрегацію корисною.",
        "Мовні маршрути й hreflang працюють без автоматичного перекладу UGC.",
      ],
    },
  },
  bg: {
    bulgaria: {
      title: "OverGarden за градинари в България",
      description:
        "Публична страница за български градинари, които искат първо личен запис на растение и по желание публично доказателство.",
      localAudience:
        "Градинари в градини, дворове, оранжерии, тераси, вили и малки домашни пространства в България.",
      promise:
        "Първо водете жива история, после решете какво става публично доказателство без разкриване на точно място.",
      proofPlan: [
        "Личният първи запис и връщането към същия обект остават ядрото на активацията.",
        "Пазарното съдържание започва авторско и тясно, докато реалните публични записи не направят агрегацията полезна.",
        "Езиковите маршрути и hreflang работят без автоматичен превод на UGC.",
      ],
    },
  },
  ru: {
    ukraine: {
      title: "OverGarden для садоводов в Украине",
      description:
        "Публичная страница для садоводов в Украине, которым нужна сначала приватная запись растения и опциональное публичное доказательство.",
      localAudience:
        "Садоводы, которые выращивают на балконах, дачах, сельских участках, в теплицах и небольших хозяйственных пространствах Украины.",
      promise:
        "Сначала ведите живую запись, затем решайте, что станет публичным доказательством без раскрытия точного места.",
      proofPlan: [
        "Приватная первая запись и follow-up того же объекта остаются ядром активации.",
        "Публичные страницы сейчас используют авторские материалы, а реальные записи появляются только после явной публикации.",
        "Локация остается скрытой или только на уровне грубого региона; точные координаты не попадают в продуктовые поверхности.",
      ],
    },
    bulgaria: {
      title: "OverGarden для садоводов в Болгарии",
      description:
        "Публичная страница для садоводов в Болгарии, которым нужна сначала приватная запись растения и опциональное публичное доказательство.",
      localAudience:
        "Садоводы в садах, дворах, теплицах, на террасах, виллах и небольших хозяйственных пространствах Болгарии.",
      promise:
        "Сначала ведите живую запись, затем решайте, что станет публичным доказательством без раскрытия точного места.",
      proofPlan: [
        "Приватная первая запись и follow-up того же объекта остаются ядром активации.",
        "Рыночный контент начинается авторским и узким, пока реальные публичные записи не сделают агрегацию полезной.",
        "Языковые маршруты и hreflang работают без автоматического перевода UGC.",
      ],
    },
  },
};

export function getLocalizedHomeContent(locale: PublicLocale) {
  return HOME_CONTENT[locale];
}

export function getLocalizedBlogIndexContent(locale: PublicLocale) {
  return BLOG_INDEX_CONTENT[locale];
}

export function getLocalizedRouteChrome(locale: PublicLocale) {
  return ROUTE_CHROME[locale];
}

export function listLocalizedBlogPosts(locale: PublicLocale) {
  return listBlogPosts().map((post) => localizeBlogPost(locale, post));
}

export function getLocalizedBlogPost(locale: PublicLocale, slug: string) {
  const post = getBlogPost(slug);

  return post ? localizeBlogPost(locale, post) : null;
}

export function listLocalizedGuides(locale: PublicLocale) {
  return listGuides().map((guide) => localizeGuide(locale, guide));
}

export function getLocalizedGuide(locale: PublicLocale, slug: string) {
  const guide = getGuide(slug);

  return guide ? localizeGuide(locale, guide) : null;
}

export function listLocalizedAnswerPages(locale: PublicLocale) {
  return listAnswerPages().map((page) => localizeAnswerPage(locale, page));
}

export function getLocalizedAnswerPage(locale: PublicLocale, slug: string) {
  const page = getAnswerPage(slug);

  return page ? localizeAnswerPage(locale, page) : null;
}

export function listLocalizedMarketLandings(locale: PublicLocale) {
  return listMarketLandings()
    .filter((landing) => isMarketLandingAvailableInLocale(landing, locale))
    .map((landing) => localizeMarketLanding(locale, landing));
}

export function getLocalizedMarketLanding(
  locale: PublicLocale,
  market: string,
) {
  const landing = getMarketLanding(market);

  if (!landing || !isMarketLandingAvailableInLocale(landing, locale)) {
    return null;
  }

  return localizeMarketLanding(locale, landing);
}

export function getMarketLandingLocales(
  market: MarketLandingContent["market"],
) {
  return listAvailableMarketLandingLocales(market);
}

export function getContentAvailableLocales(basePath: string) {
  const marketLanding = listMarketLandings().find(
    (landing) => landing.path === basePath,
  );

  return marketLanding
    ? listAvailableMarketLandingLocales(marketLanding.market)
    : (["uk", "bg", "ru"] as const);
}

function localizeBlogPost(
  locale: PublicLocale,
  post: BlogPostContent,
): BlogPostContent {
  const translation = BLOG_POST_TRANSLATIONS[locale][post.slug] ?? {};

  return {
    ...post,
    ...translation,
    sections:
      (translation.sections as BlogPostContent["sections"] | undefined) ??
      post.sections,
    relatedLinks:
      (translation.relatedLinks as PublicContentLink[] | undefined) ??
      post.relatedLinks,
  };
}

function localizeGuide(
  locale: PublicLocale,
  guide: GuideContent,
): GuideContent {
  const translation = GUIDE_TRANSLATIONS[locale][guide.slug] ?? {};
  const editorial = KNOWLEDGE_EDITORIAL_META[locale];

  return {
    ...guide,
    ...translation,
    editorial: {
      ...(translation.editorial ?? guide.editorial),
      author: editorial.author,
      source: editorial.guideSource,
      authoredLocale: locale,
    },
    steps: (translation.steps as GuideStep[] | undefined) ?? guide.steps,
    relatedLinks:
      (translation.relatedLinks as PublicContentLink[] | undefined) ??
      guide.relatedLinks,
  };
}

function localizeAnswerPage(
  locale: PublicLocale,
  page: AnswerPageContent,
): AnswerPageContent {
  const translation = ANSWER_TRANSLATIONS[locale][page.slug] ?? {};
  const editorial = KNOWLEDGE_EDITORIAL_META[locale];

  return {
    ...page,
    ...translation,
    editorial: {
      ...(translation.editorial ?? page.editorial),
      author: editorial.author,
      source: editorial.answerSource,
      authoredLocale: locale,
    },
    proofDetails: translation.proofDetails ?? page.proofDetails,
    relatedVarieties:
      (translation.relatedVarieties as PublicContentLink[] | undefined) ??
      page.relatedVarieties,
    relatedTopics:
      (translation.relatedTopics as PublicContentLink[] | undefined) ??
      page.relatedTopics,
    faqs: (translation.faqs as AnswerFaq[] | undefined) ?? page.faqs,
  };
}

function localizeMarketLanding(
  locale: PublicLocale,
  landing: MarketLandingContent,
): MarketLandingContent {
  const translation = MARKET_TRANSLATIONS[locale][landing.market] ?? {};

  return {
    ...landing,
    ...translation,
    proofPlan: translation.proofPlan ?? landing.proofPlan,
  };
}

export { BLOG_INDEX_PATH };
