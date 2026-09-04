> # 📚 СТАТУС 2026-09-04 · `ДОКАЗ`
>
> Ця тека — дослідження, написане **до** початку розробки в коді. Джерело істини про
> продукт — репозиторій. Канон: `PRODUCT_CANON_2026-09.md` · заміщення:
> `SUPERSEDED_DECISIONS_LEDGER.md` · статуси всіх файлів: `RESEARCH_STATUS_INDEX.md`.
> Звірено з `over.garden` @ `main` `ab52664`, 2026-09-04.
>
> Зріз 2026-06-10.

---

# ONLY FARMERS — OSINT-досьє (фактологічний корпус)

**Дата зрізу:** 2026-06-10. **Статус:** доказовий шар без синтезу — жодних висновків про конкурентність, рекомендацій чи вердиктів; синтез — окремим етапом.
**Метод:** 5 паралельних пошукових потоків (корпоративний / продуктовий / наративний / рецепційний / категорійний) + центральна адверсарна верифікація конфліктів; пошук 9 мовами (EN, UA, BG, RU, DE, FR, PL, ES, IT); первинні джерела відкривалися фізично; недоступні марковані `[лише сніпет]`.
**Формат provenance:** кожне твердження → `[Sxx · дата · T-рейтинг · сутність]`; повні URL — у Реєстрі джерел (§12). T1 — сайт платформи/держреєстри/сторінки сторів/офіційні акаунти; T2 — велика преса з підписаним автором; T3 — агрегатори/дзеркала/SEO/оцінювачі трафіку; T4 — соцмережеві сигнали й чутки. Числа без джерела не існують — пишемо «не встановлено».

---

## 0. Розмежування сутностей (нульовий етап)

| Код | Сутність | Статус на 2026-06-10 |
|---|---|---|
| **[A]** | **Букінг-платформа Джеремі Кларксона** — onlyfarmers.co.uk + застосунки iOS/Android; оператор Only Farmers Limited | Жива, бета; об'єкт цього досьє |
| **[B]** | Сайт знайомств **onlyfarmers.uk** (за рамкою замовника — «існував до того, не пов'язаний із Кларксоном») | **Рамкове твердження не підтвердилося:** домен NXDOMAIN (A- і NS-записи відсутні) [S07 · 2026-06-10 · T1 · B]; Wayback — нуль снапшотів [S06 · 2026-06-10 · T1 · B]; у медіа 2025–2026 згадок чи сплутувань не виявлено. Слідів живого сайту знайомств за цим доменом не знайдено |
| **[C]** | **Медіахвиля 2025 «Clarkson запускає сервіс знайомств»** — породжена трейдмарк-заявкою OnlyFarmers (клас 45 matchmaking), а не продуктом | Закрита фаза; реальний продукт [A] вийшов букінг-платформою; класи 2026 року matchmaking уже не містять (§7) |
| **[D]** | **FarmersOnly.com** — американський дейтинг-сервіс (з 2005), що тримає X-хендл @OnlyFarmers | Окрема сутність; перетин лише на рівні назви/хендла [S33 · 2026-06-10 · T4 · D] |

Контамінації між сутностями в досьє немає; усі факти нижче стосуються [A], якщо не позначено інакше.

---

## 1. Корпоративно-структурний шар

### 1.1. Юрособа-оператор
- Оператор — **ONLY FARMERS LIMITED**, company no. **17058134**, інкорпорована **26.02.2026**, private limited, статус Active; адреса **27 Mortimer Street, London W1T 3BL**; SIC **82990** (other business support services). Перша звітність — до 28.02.2027. [S01 · fetch 2026-06-10 · T1 · A]
- **Єдиний директор і єдина PSC — Lisa Bentinck** (ірландка, нар. 05/1969, резидентка UK; 75%+ акцій і голосів; ідентичність верифікована ACSP «Blinkhorns» 25.02.2026). [S01 · T1 · A]
- **Джеремі Кларксон у структурі оператора не значиться** — ні директором, ні PSC. [S01 · T1 · A]
- ⚠️ *Інференція (не реєстровий факт):* Lisa Bentinck ≡ Lisa Hogan (публічне ім'я партнерки Кларксона) — за збігом імені, національності, адреси та ролі; прямого документа «Hogan = Bentinck» не відкрито.
- **CURDLE HILL FARM LTD** (екосистема Diddly Squat) — company no. **12478400**, інкорп. 24.02.2020, та сама адреса W1T 3BL; SIC 46342/47210; директори і PSC — **Bentinck + Clarkson** (по 25–50%). Саме вона — заявник усіх трейдмарків (§7). [S02 · fetch 2026-06-10 · T1 · A]
- Реквізити з юрдокументів сайту збігаються з реєстром: Company No. 17058134, W1T 3BL; контакти hello@/privacy@/safety@onlyfarmers.co.uk. [S03, S04 · T1 · A]

### 1.2. Домен, WHOIS, Wayback
- Офіційний домен — **onlyfarmers.co.uk** (title: «Only Farmers | Farm experiences hosted by real farmers»; meta: «A direct channel between British farms and people who want to book farm stays, experiences, and events»). [S05 · fetch 2026-06-10 · T1 · A]
- onlyfarmers**.com** — порожня відповідь, контент відсутній. [S05a · fetch 2026-06-10 · T1]
- **WHOIS:** не встановлено — Nominet/whois-сервіси заблоковані мережевим середовищем дослідження (глухий кут §11).
- **Wayback:** нуль снапшотів onlyfarmers.co.uk (availability API: `archived_snapshots: {}`) — публічного waitlist/landing до запуску в архіві не зафіксовано. [S06 · 2026-06-10 · T1 · A]
- Непрямі межі запуску: інкорпорація 26.02.2026 → Privacy «Last updated 15 May 2026» → Terms «Effective 19 May 2026» → /legal «Published 20 May 2026». [S03, S04, S08 · T1 · A]

### 1.3. Технологічна основа
- **Власна розробка, не white-label** (ознак Beyonk/Bókun/Checkfront/FareHarbor/Peek/Rezdy не знайдено): `links.onlyfarmers.co.uk` → CNAME → `onlyfarmers-prod-backend-alb-…eu-west-2.elb.amazonaws.com` — кастомний бекенд за **AWS ALB (Лондон)**; apex `35.214.2.160` — **Google Cloud**; SPF: **Amazon SES + Resend**. [S09 · dns.google, fetch 2026-06-10 · T1 · A]
- **Платежі: Stripe Connect** (Stripe Payments UK Ltd / Stripe Payments Europe; Connected Accounts; платформа не торкається коштів, повна картка не зберігається). [S03 §8 · T1 · A]
- З Privacy: хостинг «AWS or Google Cloud Platform»; аналітика «Google Analytics, Mixpanel, or equivalent»; соцлогін **Apple і Google**; SDK у мобільному застосунку. [S04 · T1 · A]
- Privacy-policy застосунків хоститься на `onlyfarms-legal.s3.amazonaws.com` (S3-бакет зі старою назвою «onlyfarms»). [S10, S11 · fetch 2026-06-10 · T1 · A]

### 1.4. Команда, вакансії, інвестиції
- Публічні контакти команди: business@onlyfarmers.co.uk, **wolfe@onlyfarmers.co.uk** (контакт розробника в Google Play), телефон **+1 857-265-8900** (US-номер у лістингу — факт без інтерпретації). [S11 · fetch 2026-06-10 · T1 · A]
- LinkedIn-профілі співробітників, вакансії (LinkedIn/Indeed), агентство-розробник, інвестиції, партнерства, медіа-угоди — **не встановлено / нуль-результат**; /careers — 404. [пошуки 2026-06-10 · глухі кути §11]
- Роль Amazon/Prime Video: доказів комерційної участі немає; преса фіксує лише **таймінговий збіг** із прем'єрою S5. [S15, S16 · T2 · A]

### 1.5. Мобільні застосунки (конфлікт агентських потоків — розв'язаний центральною верифікацією)
- **iOS (App Store GB):** «Only Farmers — Book real farm experiences», розробник Only Farmers LTD; **v1.0 — 19 травня 2026, v1.01 — 21 травня 2026**; iPhone-only, English-only, 151 MB, Travel, 9+; **3 оцінки, 5.0**; маркування Apple: **«Messaging and Chat», «User-Generated Content»**; збирає Purchase History, Payment Info, Precise Location. [S10 · fetch 2026-06-10 · T1 · A]
- **Android (Google Play):** пакет **com.teds.onlyfarms** («teds» і «onlyfarms» — внутрішні кодові імена), оновлено **22.05.2026**; **100+ завантажень**; «Users Interact», 12+. [S11 · fetch 2026-06-10 · T1 · A]
- ⚠️ Внутрішня неузгодженість T1-джерел: deep-link хаб links.onlyfarmers.co.uk станом на 2026-06-10 досі показує кнопки «App Store (**Soon**) / Google Play (**Soon**)» — застарілий хаб при живих сторах. Обидва спостереження T1, подано поруч. [S12 · fetch 2026-06-10 · T1 · A]
- Примітка верифікації: два пошукові потоки не знайшли застосунків через сторовий пошук («не індексується за запитом» ≠ «не існує»); прямі URL сторінок сторів підтвердили наявність. Твердження rosійського T3-джерела про «застосунки у сторах» (mentoday.ru) — **виявилося правдивим**.

---

## 2. Продуктовий шар (найважливіший)

### 2.1. Об'єктна модель
- **Listing** = «any experience, accommodation, tour, event, or other offering published by a Farmer». [S03 §3 · T1 · A]
- Обов'язкові поля лістингу (Content Standards): опис (location, duration, what is included, restrictions); **власні фото** (стокові заборонені для головного зображення); ціна per person/group/night **inclusive of VAT** + додаткові збори; cancellation tier; accessibility-опис; age policy; health/safety-вимоги; для stays — check-in/out, house rules, max occupancy, pet/smoking; для їжі — 14 алергенів (Natasha's Law); для тварин — ризики, обмеження для вагітних/дітей; календар доступності. [S13 §6.1 · T1 · A]
- **Booking** = підтверджена резервація; прямий договір гість↔фермер, платформа — посередник; special requirements (dietary/accessibility/medical) — special category data за згодою; опціональний Tip. [S03 · T1 · A]
- **Профіль фермера:** legal/business name, trading address, email, телефон, Companies House №, VAT №, банківські реквізити, фото, комплаєнс-документи; кілька об'єктів — під одним акаунтом. [S04 §3.1, S03 §4.3 · T1 · A]
- **Ширша об'єктна модель уже в T&C:** три контури поза experiences — (а) лістинги, (б) **jobs board** (Job Posting + Work Profile), (в) **Product Marketplace** (фермери продають товари) + **Only Farmers Shop** (мерч платформи). Marketplace ще не live: «Marketplace Service Fee… To be confirmed… before the marketplace feature goes live». [S03 §1, S13 fee schedule · T1 · A]

### 2.2. Категорії і кількість лістингів
- Категорії (маркетинговий перелік, FAQ): **workshops, animal encounters, pick-your-own days, tastings, farm stays, private hire, seasonal events**. [S14–S16 · 08.06.2026 · T1-через-T2 · A]
- Категорії як власні назви в T&C §5.16: **Animal Meets, Farm Walks, Pick Your Own, Workshops, Farm Stays** + окремо **Hunting Listings (shooting experiences, 18+)** і **Tasting Listings** з алкоголем — T1 додає до прес-списку Farm Walks і Hunting. [S03 · T1 · A]
- **Кількість лістингів по категоріях/регіонах: не встановлено.** Перешкоди (вичерпно): sitemap.xml/robots.txt без переліку; Google-індекс містить лише головну; продуктові сторінки — клієнт-рендерений SPA-шелл; Wayback порожній; браузерний обхід у цій сесії недоступний (§11).
- Непрямі сигнали масштабу: «The app remains in its **beta stage** and only lists **a few experiences**» [S17 · 08.06.2026 · T2 · A]; «already has listings from multiple farms» [S18 · T3 · A]; приклади лістингів: глемпінг-поди в Шотландії на 6 осіб **£220/дорослий**, farm visit у Jedburgh **£15/дорослий**, «animal walkaround» на Thorabella Farm (Moray) **£6/дорослий**, stargazing, food & drink tasting [S17 · T2 · A]; «overnight accommodation, guided tours, animal encounters and catering services» [S19 · 09.06.2026 · T2 · A]. Порядок величини — **одиниці–десятки лістингів**.
- Google Play: **100+ установок** — єдиний числовий proxy попиту. [S11 · T1 · A]

### 2.3. Бронювання й оплата
- Конфірмація: «A Booking is confirmed when payment has been successfully processed…  Until that point, no binding contract exists» — модель «оплата одразу»; водночас онбординг зобов'язує фермера відповідати на «Booking requests within 24 hours» → існування request-режиму **не встановлено однозначно** (обидва сигнали T1 поруч). [S03 §6.1, S13 §8 · T1 · A]
- **Валюта: GBP only** (транзакції і виплати). Гості за eligibility — **UK або EEA**; маркетинг ширший: «welcoming visitors from around the world» — зафіксована напруга юридичного і маркетингового формулювань. Іноземні картки приймаються (застереження про конвертаційні збори банку). [S03 §4.1, §8.2 · T1 · A]
- Виплати фермерам: Stripe, 3 робочі дні від дати experience; новим фермерам (до 2 верифікованих бронювань) — 2 робочі дні **після завершення** (антифрод). [S13 §4.3 · T1 · A]
- Чайові: 100% фермеру, без комісії. Gift bookings є. Damage Reports: списання з картки гостя з 72-год правом заперечення. [S03, S13 · T1 · A]

### 2.4. Комісія — число встановлено
| Збір | Розмір | Джерело/рівень |
|---|---|---|
| **Farmer Fee** | **7.1%** від ціни лістингу, утримується з виплати | [S13 §4.2 fee schedule · T1 · A] |
| **Service Fee (гість)** | **2.5%** від ціни лістингу, на чекауті («primarily covering Stripe… and platform operating costs») | [S13 · T1 · A] |
| Перші **£300** заробітку фермера | **без комісії** | FAQ сайту, цитований пресою [S17, S19 · T2 · A]; **у юрдокументах порога £300 немає** — розбіжність рівнів зафіксована |
| Адмінзбори за скасування фермером | **£25 / £50 / £100** (ескалація) | [S13 · T1 · A] |
| Marketplace Service Fee | «To be confirmed» (до запуску фічі) | [S13 · T1 · A] |
| Зміна ставок | мін. 30 днів письмового попередження | [S13 · T1 · A] |

«Low commission» із прес-позиціювання має конкретне наповнення: 7.1% + 2.5%.

### 2.5. Онбординг хостів
- Вимоги: 18+; діяльність «in the course of a trade, business, or profession»; **«Be based in the United Kingdom»** (гео-обмеження хостів підтверджене T1); legal authority на землю/приміщення. [S13 §2–3 · T1 · A]
- Кроки: реєстраційна форма → **identity verification** (third-party photo-ID matching) → комплаєнс-документи за типом лістингу → Stripe KYC/AML.
- Комплаєнс за типами: **public liability insurance £5M** (події >500 осіб — £10M), доказ до публікації; stays — CP12, Fire Risk Assessment, EICR, EPC; їжа — реєстрація food business + Level 2 Food Hygiene; алкоголь — premises licence/TEN; тварини — ліцензії 2018 Regulations; **hunting — Shotgun/Firearms Certificate**; діти — risk assessment + DBS; short-term lets — реєстри/шотландська ліцензія. [S13 · T1 · A]
- Модерація: «does not review or approve Listings prior to publication», але публікація лише після верифікації документів + право takedown. DAC7-звітність у HMRC. [S13 · T1 · A]
- Вимога «лише справжні робочі ферми» **як формальний критерій не встановлена** — визначення Farmer широке («any business… that registers to list…»); «real farms» — маркетингова рамка (цитата Купера), не юридична. [S13 · T1 · A]
- Фазований запуск supply-сторони: банер сайту «**Founding farmer access opens 22 May**» — когорта «founding farmers». [S05 (рендер) · T1 · A]

### 2.6. Відгуки, месенджер, скасування, ранжування
- **Відгуки:** Reviews Policy; відгуки + відповіді фермерів публікуються; review score & volume — фактор ранжування №3; заборона маніпуляцій; зберігання — тривалість акаунта + 1 рік. [S03, S13 §7.1 · T1 · A]
- **Месенджер:** вбудований і обов'язковий до бронювання («All pre-booking communication must take place through the Platform's messaging system»; обмін прямими контактами до конфірмації заборонений; off-platform угоди — «material breach» із відшкодуванням втрачених зборів). Зберігання повідомлень — 3 роки. [S03 §5.5 · T1 · A]
- **Скасування:** 4 рівні — Flexible / Moderate / Strict / Non-refundable (останній — лише з «reasonable commercial justification»); Platform Minimum Standard (мін. 50% повернення при скасуванні >7 дн experiences / >14 дн stays); пеня фермерам за скасування: попередження → £50 + **публічний бейдж «Recent cancellation» на 90 днів** → £100 + зниження видимості 30 днів → suspension; Major Disruptive Events = повний рефанд без пені. [S20 · T1 · A]
- **Ранжування розкрите** (у порядку ваги): релевантність запиту/локації → booking history & conversion rate → review score & volume → повнота лістингу → recency/availability → надійність фермера; секція «Coming Up Near You»; персоналізація з opt-out. [S13 §7.1, S04 §4.1 · T1 · A]

### 2.7. КОНТЕНТНИЙ ШАР — найбільш рішення-релевантний пункт дослідження
**Резюме факту: контентно-соціальний шар існує — це ком'юніті-механіка типу стрічки (пости/підписки/лайки/коменти) довкола профілів, НЕ редакційний блог і НЕ структуровані журнали господарств. Публічно він не індексується (нуль URL контенту в Google), живе всередині SPA/застосунку. Лонгітюдних фотощоденників, журналів чи хронік ферм як окремого формату не виявлено.**

Докази за рівнями (валентно симетрично — і «за», і «проти»):
- **T1 (за):** meta deep-link хабу застосунку: «Book farm tours, **browse the farmer community**, and discover experiences on Only Farmers» — community названа функцією першого ряду. [S12 · fetch 2026-06-10 · T1 · A]
- **T1 (за):** App Store маркує застосунок «**User-Generated Content**» + «Messaging and Chat»; опис: «Set your preferences to **personalise your feed**…»; «stay connected with their **community**». [S10 · fetch 2026-06-10 · T1 · A]
- **T1 (за, непрямо):** T&C визначають Content як «text, images, **videos**, reviews, or other material… **published on** the Platform»; §10 — модерація, ліцензія платформі, OSA-2023-комплаєнс — інфраструктура під UGC, ширший за відгуки. [S03 · T1 · A]
- **T1 (за, роадмапно):** свіжі TM-заявки 20.05.2026 містять клас 38 (онлайн-форуми, чати, фотошеринг спільноти) і клас 45 (**online social networking** для фермерів, агропрацівників і відвідувачів, вкл. через мобільні застосунки). [S21, S22 · T3-дзеркало реєстру з T1-якорем · A]
- **T2 (за, єдиний опис механік):** «The site also features a **social media aspect where people can post about experiences, follower users and like and comment** — rather the same vein as Instagram». Другим незалежним джерелом механік не підтверджено. [S17 · 08.06.2026 · T2 · A]
- **T2 (за):** профілі як контент-носії — Кларксон «states **on his profile page**…», Купер «**wrote on his Only Farmers profile**…» — публічні текстові статуси/дописи на профілях. [S19, S15 · T2 · A]
- **Проти / межі шару (T1):** Privacy §3 не містить категорій даних «posts/followers/likes» (лише reviews, descriptions, messages + загальне «other content») — юрдокументи або покривають соцшар загальним терміном, або відстають від продукту; зафіксована неузгодженість. [S04 · T1 · A]
- **Проти (T1, верифікована відсутність редакційного шару):** /blog, /stories, /journal, /diary, /updates, /community — порожні SPA-шели без SSR-meta; sitemap відсутній; **у Google-індексі нуль контентних URL** (site:-запити з blog/story/diary/journal — 0); /legal не містить content/editorial-політик поза Reviews Policy. [fetch 2026-06-10 · T1 · A]
- **Фальшивий слід (маркований):** заголовок SEO-клона «…Allowing Farmers to **Share Content Directly With Fans**» — спін передруку Standard; у тілі — «share experiences, stays, food and events with visitors». Заголовок ≠ доказ контентної функції. [S23 · T4-заголовок/T3-тіло · A]

### 2.8. Kaleb Cooper, Lisa Hogan, Diddly Squat
- **Kaleb Cooper** — має профіль; текст: «This is real farms. Real people. Real countryside.» Чи має власні bookable-лістинги — не встановлено; URL профілю не індексується. [S15, S17, S19 · T2 · A]
- **Lisa Hogan** — має профіль; вмісту/лістингів преса не описує — не встановлено. [S15, S17 · T2 · A]
- **Jeremy Clarkson** — профіль зі статусом «There are experiences in the countryside you never knew existed»; на сайті позначений як «**an aspiring farmer**». [S19, S16 · T2 · A]
- **Diddly Squat:** станом на 09.06.2026 «has yet to offer any bookable experiences» — власна ферма Кларксона на платформі не лістується. [S19 · T2 · A]
- Походження назви (непряма мова Кларксона): «the name Only Farmers came about after discovering that **Only Farms had already been registered**». [S19 · T2 · A]

### 2.9. Мови, валюти, доступність
- Інтерфейс/документи — **лише англійська** (App Store: Language EN; hreflang відсутній); валюта — **GBP only**; бронювання з-за кордону можливе (juridично UK/EEA-eligibility, див. §2.3). [S10, S03 · T1 · A]

---

## 3. Позиціювання і наратив

### 3.1. Офіційний месседжинг (дослівно)
- Title: «Only Farmers | Farm experiences hosted by **real farmers**»; meta: «**A direct channel** between British farms and people who want to book farm stays, experiences, and events». [S05 · T1 · A]
- «**built by farmers, for farmers**»; «discover, book, and support British farms»; «helps British farms share experiences, stays, food and events with visitors from around the world». [S19, S16 · T1-через-T2 · A]
- FAQ: «The platform is built for bookable farm experiences: workshops, animal encounters, pick-your-own days, tastings, farm stays, private hire, and seasonal events. Only Farmers is launching with **UK farms first**, while welcoming visitors from around the world… **book directly with the farmer**». [S14–S17 · T1-через-T2 · A]
- Цінове копі: «Farmers pay a 7.1% commission only on confirmed bookings. The first £300 earned through Only Farmers is completely free». [S17, S19 · T2 · A]
- Опис застосунку (T1): «Explore Britain's farms…»; «Every listing is built around **the farm, the people hosting it and the experience**… feel closer to the **food, land and stories** behind each visit»; «Built for the people who **grow, make and share food**». [S10, S11 · T1 · A]

### 3.2. Мотивація Кларксона: прямі слова vs інтерпретації
- Прямих розгорнутих заяв Кларксона 2026 року про мотиви платформи **не знайдено** (його колонки The Times/The Sun недоступні краулеру — §11). Єдина пряма цитата — статус профілю (§2.8).
- Доплатформений наратив (2025, контекст [C]): «**Loneliness is becoming a big issue in rural areas**… villages are losing their souls»; перший крок — **Farmers' Clubhouse** у пабі The Farmer's Dog («a place where they could come to talk»). [S24, S25 · 01.07.2025 · T2 · C]
- Журналістські інтерпретації (не цитати): «wanted to help people understand what farms have to offer» [S16]; «set his eyes on the **city-dwellers who have never set foot on a farm**» [S15]; «campaigned for the rural economy» [S26 · T3]. Атрибуція «describing it as a rival to Airbnb» (GB News/NZH) — двозначна: дослівних слів Кларксона про Airbnb жодне джерело не наводить. [S19 · T2 · A]

### 3.3. Прес-фреймінг (хвиля 08–09.06.2026)
| Видання · дата · автор | Фрейм | T |
|---|---|---|
| The Independent · 08.06 11:29 UTC · Adam White | «easily confused for X-rated website»; «**a farm-based take on Airbnb**, only with a far dirtier-sounding moniker»; «online marketplace» | T2 |
| Evening Standard · 08.06 12:15 UTC · Ekin Karasin | «his own version of **OnlyFans** for farmers» | T2 |
| LADbible · 08.06 15:55 · Jen Thomas | «tongue-in-cheek play on OnlyFans… actually quite wholesome»; «attempting to **take on Airbnb**»; контекст staycation-тренду й «jet fuel crisis» 2026 | T2 |
| JOE · 08.06 17:10 · Harry Warner | бета; Instagram-подібний соцшар; приклади лістингів; ⚠️ унікальне твердження «**takes centre stage in the latest series**» — жодне інше джерело не повторює; конфлікт із консенсусом «coincides with» (4 видання) — статус: непідтверджено | T2 |
| GB News · 09.06 08:12 · Lydia Davies | «**a rival to Airbnb**»; «launched in May»; деталі комісій; «The fee structure has been designed to favour farmers» | T2 |
| NZ Herald (синдикат GB News) | «OnlyFans-style venture» | T3 `[лише сніпет]` |
| Дзеркало The Sun (SEO) | «cheeky take on saucy website OnlyFans»; «takes on another web giant, Airbnb» | T3 |
- Точна фраза «agritourism marketplace» дослівно не зафіксована; найближче — «marketplace for farm-based experiences» (синдикат) і «agricultural tourism… 'agritourism'» (LADbible як категорія).
- **Гумористичний шар (маркований):** уся хвиля заголовків будується на OnlyFans-каламбурі («risky click», «get your mind out of the gutter», «My god, wouldn't it be wonderful if Jeremy Clarkson pitched his tent here»). Сатиру від фактів відокремлено; до фактології не домішано. [S15, S16, S14 · T2]

### 3.4. Явно названі аудиторії
(1) міські жителі, що ніколи не були на фермі (журналістський парафраз цілі Кларксона); (2) міжнародні туристи («welcoming visitors from around the world» — копі сайту); (3) британські staycation-туристи (редакційна рамка LADbible на тлі паливної кризи 2026); (4) supply-сторона: ферми Великої Британії («UK farms first», «built by farmers, for farmers»). [S14–S17 · T1-через-T2/T2 · A]

### 3.5. Зв'язок із Clarkson's Farm S5
- Графік Amazon: S5 еп. 1–4 — **03.06.2026**, еп. 5–6 — 10.06, еп. 7–8 — 17.06. [S27 · 20.04.2026 · T1 · шоу]
- Консенсус 4 видань: запуск «**coincides with**» прем'єрою — окремий запуск, синхронізований у часі. Конфліктне твердження JOE («takes centre stage in series») — непідтверджене; рецензії Guardian/Metro (03.06) платформу не згадують; еп. 7–8 ще не вийшли на дату зрізу — поява платформи у фіналі сезону принципово неперевірювана. [S15–S19 · T2 · A]
- Офіційна сторінка Amazon про S5 платформу не згадує; доказів медіа-угоди немає. [S27 · T1]

---

## 4. Тяга і рецепція

### 4.1. Трафік і зовнішні метрики
- Similarweb, **травень 2026: 96 візитів** — нижче порога вимірюваності («даних фактично немає»; топ-країна «Turkey 100%» — шум мікровибірки); червень ще не опублікований. [S28 · знято 2026-06-10 · T3-оцінка · A]
- Google-індекс: **лише головна сторінка**; Wayback: нуль снапшотів. [T1 · A]
- Google Play: **100+ установок**; App Store: 3 оцінки (5.0). [S10, S11 · T1 · A]
- Кількість ферм/хостів/бронювань — **не встановлено** (жодне джерело не називає).

### 4.2. Власні соцканали платформи — не виявлені
X-хендл @OnlyFarmers зайнятий **FarmersOnly.com** [D]; Instagram/TikTok/Facebook-акаунтів платформи не знайдено; жодна з прес-публікацій на соцакаунти платформи не посилається. Дистрибуція станом на зріз — персональні канали Кларксона, серіал і преса. (Соцмережі недоступні фетчеру — браузерна верифікація в §11.) [S33 · T4; пошуки 2026-06-10]

### 4.3. Реакції фермерської спільноти
- **Галузева фермерська преса — нуль публікацій про платформу:** Farmers Weekly, Farmers Guardian, NFU Online, FarmingUK, Agriland, Farmers Guide (site:-пошуки 2026-06-10). Запуск висвітлила лише розважальна/таблоїдна преса. [нуль-результат · A]
- **The Farming Forum:** окремої нитки про Only Farmers не знайдено; у живій нитці «Clarksons farm» (старт 04.06.2026, ~175 постів) платформа на перевірених сторінках **не згадується**. Сентимент щодо Кларксона загалом (контекст [A-сусід], усі T4):
  - (+) Bertram: «we've sold a considerable amount of meatboxes… to new customers who… are now interested in locally produced stuff **because of JC**» (#10182600, 09.06);
  - (+) JP1: «If he stopped the farm tomorrow, he'd be a success in some other business sphere»;
  - (0) Martin Holden: «He "is the brand". Without his name on any project, it wouldn't have the same impact»;
  - (−) delilah: «Whole thing is a f@cking circus»; «…to adopt Clarkson as your IHT poster boy. A wrong call that has done you more harm than good»;
  - (−) Right-arm fast: «Just something to film for Geoff Bezos to broadcast». [S29 · 04–10.06.2026 · T4 · A-сусід]
- Хост-сторона: Thorabella Farm (Moray) — реальна ферма (VisitScotland), її лістинг зафіксований пресою; публічних заяв ферм про приєднання не знайдено. [S30 · T2]

### 4.4. Реакції гостей
Прямі користувацькі реакції не зібрані: Reddit — нуль індексованих тредів (4 формулювання + r/ClarksonsFarm; домен у блок-листі), коментарні секції видань і FB-групи недоступні (§11). Єдиний індексований соцсигнал: X @TheGriftReport — нейтрально-анонсний. [S31 · T4 · A]

### 4.5. Скепсис і критика (повна фіксація)
- **Критики платформи [A] у пресі станом на 2026-06-10 не зафіксовано:** 6 цільових негатив-запитів (criticism / backlash / cash grab / scam / commission complaints / insurance·safety) — нуль релевантних результатів. Вікно запуску пройшло без зафіксованого пушбеку — це факт, а не оцінка.
- Дотичний скепсис (сутності марковані):
  1. Назва-плутанина [A]: «easily confused for X-rated website» (Independent).
  2. SEO-дисторсія [A]: клон-заголовок «Share Content Directly With Fans» — ризик відтворення хибного фрейму агрегаторами. [S23 · T3/T4]
  3. Celebrity-втома бренду [A-сусід]: Guardian-рецензія S5 (3/5): «you might as well call him **Jeremy Kardashian**… Stick to the farming, Jeremy!»; Metro (2/5): «proves why it needs to end… rinse-and-repeat»; Independent-фіча «How Jeremy Clarkson **farmwashed** his dodgy reputation». [S34, S35, S36 · 03–06.2026 · T2 · A-сусід]
  4. Власна ферма не на платформі [A]: Diddly Squat без bookable experiences (§2.8) — потенційний матеріал для закидів, у пресі поки не розгорнутий. [S19 · T2]
  5. Бета і мала глибина [A]: «only lists a few experiences». [S17 · T2]
  6. Порівнянь із Hipcamp/Pitchup/Feather Down/Farm Stay UK/Beyonk у покритті **немає взагалі** — преса порівнює тільки з Airbnb. Страхування/safety щодо платформи — нуль згадок.
- Симетрично з боку позитиву: формальної підтримки NFU/CLA/фермерських організацій **теж не зафіксовано** (нуль). Позитив: умови «designed to favour farmers» (GB News); адвокація Кларксона фермерству (Adam Henson: «He's a great advocate for British agriculture», Independent; TFF-ефект ореолу на продажі). [S19, S15, S29]

### 4.6. Географія покриття за мовами (зріз 2026-06-10)
| Мова/ринок | Покриття | Деталі |
|---|---|---|
| EN/UK | Ядро хвилі | Standard, Independent, LADbible, JOE, GB News (08–09.06) |
| EN/синдикація | Так | Yahoo, AOL, inkl, NewsBreak, Newswav (MY), MSN en-ZA, NZ Herald |
| **Українська** | **Нуль** | 3 запити укр. мовою — жодного укр. медіа; видача дає лише RU-сайти й піратські каталоги серіалу |
| **Болгарська** | **Нуль** | 2 запити болг. мовою; 24chasa.bg — лише старі матеріали про Кларксона-фермера, не про платформу |
| Російська | Так | mentoday.ru (10.06, нейтрально-цікавісний, «сільський аналог OnlyFans»; твердження про застосунки — підтверджене нашою верифікацією), championat.ru `[сніпет]` |
| DE / FR / PL / ES / IT | **Нуль** | цільові запити кожною мовою — без результатів |
- Мета-сигнал ваги події: News Minimalist (AI-ранжування 33 438 статей за 08.06) — значущість **1,1/10** (топ-57%): глобально це розважальна нота, не бізнес-подія. [S18 · T3]

---

## 5. Категорійний контекст (factual baseline, без вердиктів)

### 5.1. Мапа категорії UK farm-experience / agritourism букінгу
| Гравець | Ферми | Формати | Комісія/модель | Масштаб | Джерело |
|---|---|---|---|---|---|
| **Only Farmers** [A] | так (UK-only хости) | experiences + stays + events (+ jobs board і marketplace у T&C) | **7.1% хост + 2.5% гість**; перші £300 без комісії | бета; одиниці–десятки лістингів; 100+ установок | S13, S17, S11 · T1/T2 |
| Airbnb (+Experiences) | farm stays як категорія; Experiences перезапущені 2025 | stays + experiences + services | stays: 3% хост / 14.1–16.5% гість або single 15.5%; **Experiences 20%**; Services 15% | 9M+ лістингів, 220+ країн (05.2026) | S37, S38 · T1 |
| Hipcamp UK | так («blueberry farms») | кемпінг/глемпінг/stays | лістинг безкошт.; **12.5%+VAT** з хоста + Stripe 1.4%+20p | 500k+ локацій глобально | S39 · T1 |
| Pitchup | так | кемпінг/глемпінг | **15%** (2.5% reclaim для VAT-reg.) | «6,000+ об'єктів, 30M візитів/рік» | S40 · T1 `[сніпет]` |
| Feather Down Farms | лише робочі ферми | глемпінг «під ключ» + farm experience | партнерська; умови **не встановлено** | 65+ ферм у 5 країнах, 20+ років | S41 · T1 |
| Farm Stay UK | так | каталог B&B/self-catering/glamping, бронь напряму | **членство без комісії**: £365–£1,015/рік | кооператив з 1983; к-сть членів не публікується | S42 · T1 |
| Beyonk | так (farm ticketing) | B2B-софт квитків (не споживчий маркетплейс) | **4%** ticketing (+1% marketing suite; збір можна перекласти на покупця) | непублічно | S43 · T1 |
| CoolStays | частково | маркетинг-платформа stays | підписка без комісії | 4M візитів сайту/рік | S44 · T1 |
| Canopy & Stars | частково (глемпінг) | stays, «marketing and booking agent» | комісія не публікується | UK+6 країн ЄС/Скандинавії | S45 · T1 |
| Scottish Agritourism | так | секторна організація/каталог | членська модель | 888 ферм/крофтів (Census 2025) | S46 · T2 |

### 5.2. Прецеденти farm-experience маркетплейсів (десятиліття)
- **Yonder (US→UK), найближчий аналог за пітчем — зник.** Заснований 2018 фермером Tim Southwell («mainstream booking sites under-serve the farm stay community»); 05.2021 — UK-запуск із 5,000+ лістингів, комісія **8%**, $4M seed, плани Південної Європи і activities. Станом на 2026 домен yonder.com належить непов'язаному UK-фінтеху; точна дата закриття — не встановлено. [S47, S48 · T2/T1 · прецедент]
- **Tentrr (US) — провал:** 1,000+ локацій у 43 штатах; Chapter 11 (01.2023) → Chapter 7 (ліквідація); хости лишилися з обладнанням без платформи. [S49, S50 · T2/T3]
- **Harvest Hosts (US) — діючий успіх membership-моделі:** $99–179/рік, 9,700+ локацій (з них 2,395 ферми), 250k членів; UK-аналог за моделлю — Brit Stops. [S51 · T1]
- **Feather Down Farms — success-довгожитель** curated-моделі (20+ років). [S41 · T1]
- **WWOOF — інша модель** (волонтерський обмін без грошей, з 1971, 80+ країн), не букінг-маркетплейс. [S52 · T1]

### 5.3. Розмір ринку UK-агротуризму
- **NFU 2025: £170–660M/рік** (farm-based recreation/retail/accommodation, за регіонами) — **першоджерело не локалізоване**; цифра існує лише як цитата LADbible. Можлива плутанина з NFU Mutual/DEFRA — не підтверджено. [S15 · T2-цитата · глухий кут §11]
- **Шотландія (найякісніша відкрита цифра):** Agritourism Census 2025 — сектор **£292M** (ціль-2030 £250M перевиконана), 2.5M візитів/рік, 888 ферм, 8,076 FTE; £1M Agritourism Investment Scheme; **Global Agritourism Conference — Абердин, 23–25.06.2026** (~1,000 делегатів зі 100 країн). [S46 · 04.12.2025 · T2]
- Орієнтири з цитати секторної лідерки (методологія не розкрита): Австрія ~£12bn, Італія ~£17bn. [S46 · T2 · обережно]
- Mintel/Statista/VisitBritain — відкритих сторінок із цифрами не знайдено. [глухий кут]

---

## 6. Роадмап і сигнали експансії

- **Міжнародна експансія: нуль конкретики.** Єдина публічна формула — «launching with UK farms first, while welcoming visitors from around the world»; заяв про наступні країни/строки не знайдено — зафіксовано як нуль-результат. [S14–S16 · T1-через-T2 · A]
- **Мобільний застосунок — уже live, не план** (§1.5). English-only, без ознак локалізації під міжнародні ринки. [S10, S11 · T1 · A]
- **Найсильніший роадмап-сигнал — дві свіжі TM-заявки 20.05.2026** (UK00004391172 з лого + UK00004391243 словесна; обидві «Application Published»; заявник Curdle Hill Farm Ltd; представник CMS Cameron McKenna). Класи 9, 16, 18, 21, 25(лише 4391172), 35, 38, 39, 41, 42, 43, 44, 45. Продуктові лінії, що читаються з формулювань: [S21, S22 · T3-дзеркало UKIPO · A]
  - **соцмережа/ком'юніті фермерів** (кл. 38: форуми, чати, фотошеринг; кл. 45: online social networking via mobile apps; кл. 9: апп із «social networking functionalities», «private networks and online communities») — цифрове продовження офлайн-лінії Farmers' Clubhouse;
  - **e-commerce фермерських товарів** (кл. 35: online marketplace + ритейл м'яса, риби, молочки, сирів, джемів, меду, пива, вина; кл. 42: «hosting of e-commerce platforms») — узгоджується з Marketplace/Shop, уже прописаними в T&C (§2.1);
  - **весілля та private hire, serviced apartments** (кл. 43);
  - **wellness/спа** (кл. 44: spa, massage, sauna; кл. 41: йога, пілатес, медитація, фітнес) і **польові активності** (кл. 41: clay pigeon shoots, paintball, стрільбища);
  - **farm-management SaaS** (кл. 42: «SaaS… for the management of farms»; кл. 9: «mobile application software for managing farm resources»);
  - мерч (кл. 16/18/21/25, вкл. wellington boots і термоодяг).
  - **Matchmaking у заявках 2026 відсутній** (право з TM-2025 існує, але не розвивається). Суміжний шум: Lisa Hogan анонсувала фермерське дейтинг-шоу для **ITV** — ТВ-проєкт, не фіча платформи. [S19 · T2]
- **Вакансій немає** (LinkedIn/Indeed — нуль; /careers — 404) — зафіксовано як нуль-результат. [пошуки 2026-06-10]
- Фазований supply-онбординг: «Founding farmer access opens 22 May» (когорта founding farmers). [S05 · T1 · A]

---

## 7. Трейдмарк-слід (повний, з конфліктами дат)

| Заявка | № | Подана | Статус | Класи |
|---|---|---|---|---|
| **Only Farms** | UK00004198121 | **01.05.2025** (TrademarkElite) vs «2 травня» (Yahoo) — конфлікт ±1 день, обидві версії | публікація 16.05.2025; преса 07.2025: «**opposed**» → поточний статус у дзеркалі реєстру: «**Withdrawn**» (хронологічно сумісні; показано обидва) | 18 (tote bags), 21 (mugs), 24 (tea towels, picnic blankets), 25 (T-shirts, hoodies), 35 (merchandising) — суто мерч |
| **Only Farmers** | UK00004219973 | **16.06.2025** (TrademarkElite) vs «17 червня» (Yahoo/NationalWorld; renewal 17.06.2035 узгоджується з 17-м) — конфлікт, обидві версії | публікація 03.10.2025; **зареєстрована 12.12.2025** | 25 (одяг, капелюхи), 35 (business info via website, retail одягу, бізнес-посередництво), 42 (website design/hosting), 44 (agricultural services), **45 (matchmaking services)** |
| **ONLY FARMERS (лого)** | UK00004391172 | **20.05.2026** | Application Published | 9, 16, 18, 21, 25, 35, 38, 39, 41, 42, 43, 44, 45 (деталі в §6) |
| **ONLY FARMERS (словесна)** | UK00004391243 | **20.05.2026** | Application Published | ті самі мінус 25 |

Заявник усіх чотирьох — **Curdle Hill Farm Ltd**. Хвиля 2025 [C] «Clarkson запускає дейтинг» виросла саме з класу 45 заявки UK00004219973 — без підтвердження від Кларксона (Yahoo: «has reached out… for further comment»). Первинні case-сторінки UKIPO — JS, текст не віддають; класи зчитані з дзеркала TrademarkElite (T3) з T1-якорем на реєстр. [S21, S22, S24, S25, S53]

---

## 8. Лінза релевантності OverGarden (тегування фактів; без вердиктів)

| Вимір | Факт [A] з provenance | Тег перетину |
|---|---|---|
| Аудиторії | Supply: комерційні UK-ферми (B2B-хости, UK-only, §2.5); demand: міські жителі UK + міжнародні туристи (§3.4) | OverGarden: аматори-практики UA/BG → перетин аудиторій **за фактами відсутній**; перетин «персона IT-balcony ↔ міський гість ферми» — лише як споживач разового досвіду |
| Ключова поведінка | Ядро — **разова транзакція бронювання** (§2.3); довкола — соцстрічка постів/лайків (§2.7) | OverGarden: регулярне лонгітюдне ведення журналу → поведінковий перетин — лише в community-шарі, не в ядрі |
| Контент/дата-активи | UGC = пости стрічки + відгуки; **нуль публічної індексації контенту** (§2.7); каталог бронювальних пропозицій | OverGarden: верифіковані часом записи вирощування, публічний SEO-UGC → **протилежна дата-стратегія** (закритий SPA vs індексований журнал) — факт, не вердикт |
| Географії/мови | UK-only хости; GBP-only; EN-only; **нуль покриття UA/BG-медіа** (§4.6); сигналів експансії нуль (§6) | Географічний перетин із UA/BG на зрізі — **нульовий** |
| Монетизація | Take-rate 7.1%+2.5% (§2.4); роадмап: marketplace, SaaS, wellness (§6) | OverGarden-модель інша; перетин можливий лише в майбутньому farm-management SaaS-класі (TM кл. 42) — спекулятивний горизонт, маркер для відстеження |
| Рушій росту | Celebrity-медіа маховик (серіал S5 + преса; власних соцканалів немає, §4.2) | OverGarden: органічний UGC-SEO → рушії протилежні; факт: модель Only Farmers без celebrity не відтворюється |
| Найбільш рішення-релевантний факт | **Контентний шар = соцстрічка ком'юніті, БЕЗ лонгітюдних журналів господарств і без публічної індексації** (§2.7, чотири незалежні якорі T1+T2) | Прямого аналога механіки «доказового журналу» на платформі не виявлено станом на 2026-06-10 |

---

## 9. Хронологія сутності (повний датований таймлайн)

| Дата | Подія | Сутність | Джерело · T |
|---|---|---|---|
| 24.02.2020 | Інкорпорація Curdle Hill Farm Ltd (12478400; Bentinck + Clarkson) | екосистема | S02 · T1 |
| 01–02.05.2025 | Заявка TM **Only Farms** UK00004198121 (мерч-класи) — конфлікт дат показано | C-передумова | S53, S24 · T3/T2 |
| 16.05.2025 | Публікація Only Farms у журналі 2025/020 | C | S53 · T3 |
| 16–17.06.2025 | Заявка TM **Only Farmers** UK00004219973 (вкл. кл. 45 matchmaking, кл. 25 одяг) — конфлікт дат показано | C | S21, S24, S25 · T3/T2 |
| кін. 06 — 01.07.2025 | Медіахвиля «Clarkson запускає дейтинг» (Mail/Yahoo/NationalWorld); Only Farms на цей момент — «opposed»; підтвердження від Кларксона немає | **C** | S24, S25 · T2 |
| 03.10.2025 | Публікація Only Farmers у журналі 2025/040 | C→A | S21 · T3 |
| 12.12.2025 | **Реєстрація TM Only Farmers** | A | S21 · T3 |
| 26.02.2026 | **Інкорпорація ONLY FARMERS LIMITED** (17058134; єдина директорка/PSC — Bentinck) | A | S01 · T1 |
| 20.04.2026 | Amazon анонсує графік S5 (03/10/17.06) | шоу | S27 · T1 |
| 15.05.2026 | Privacy Policy «Last updated» | A | S04 · T1 |
| **19.05.2026** | T&C + Farmer Onboarding Agreement «Effective date»; **iOS-застосунок v1.0 у App Store** | A | S03, S13, S10 · T1 |
| 20.05.2026 | /legal «Published»; **дві нові TM-заявки** UK00004391172/4391243 (соцмережа, e-commerce, wellness, SaaS) | A | S08, S21, S22 · T1/T3 |
| 21.05.2026 | iOS v1.01 | A | S10 · T1 |
| **22.05.2026** | Android-реліз (оновлення); банер «**Founding farmer access opens 22 May**» — фазований онбординг хостів | A | S11, S05 · T1 |
| ~25.05.2026 | Орієнтовний тихий веб-запуск: «launched two weeks ago» (Sun-дзеркало від ~08.06); GB News: «launched in May»; точний день — не встановлено | A | S26, S19 · T3/T2 |
| 03.06.2026 | Прем'єра S5 (еп. 1–4); рецензії Guardian 3/5 («Jeremy Kardashian»), Metro 2/5 | шоу/A-сусід | S27, S34, S35 · T1/T2 |
| **08.06.2026** | **Публічна медіахвиля**: Independent 11:29 UTC → Standard 12:15 → LADbible 15:55 («Clarkson **shares** new website» — натяк на соцмережевий пуш цього дня; першоджерело-пост не здобуто) → JOE 17:10 | A | S14–S17 · T2 |
| 09.06.2026 | GB News: комісії, походження назви, Diddly Squat без лістингів | A | S19 · T2 |
| 10.06.2026 | **Дата зрізу**: Similarweb трав. = 96 візитів; Play 100+ установок; галузева фермерська преса мовчить; UA/BG/DE/FR/PL/ES/IT-покриття — нуль; еп. 5–6 S5 виходять цього дня | A | S28, S11 · T3/T1 |

---

## 10. Консолідація: верифіковане ядро vs неверифіковані сигнали

### 10.1. Верифіковані факти (T1/T2 — ядро досьє)
1. Оператор: Only Farmers Limited, №17058134, інкорп. 26.02.2026; єдина директорка/PSC — Lisa Bentinck; Кларксона в структурі немає. [S01 · T1]
2. TM-заявник усіх 4 марок — Curdle Hill Farm Ltd (Bentinck+Clarkson). [S02 · T1; S21–S22 · T3-дзеркало]
3. Домен-якір onlyfarmers.co.uk; самоопис «A direct channel between British farms and people…». [S05 · T1]
4. Комісія: **7.1% хост + 2.5% гість**; пеня за скасування £25/£50/£100; Stripe Connect; GBP-only. [S03, S13 · T1]
5. Поріг «перші £300 без комісії» — рівень FAQ/преси (T2), **у юрдокументах відсутній**. [S17, S19]
6. Хости — лише UK; страхування £5M; верифікація ID; модерація документів до публікації; DAC7. [S13 · T1]
7. Категорії: workshops, animal encounters/Animal Meets, Farm Walks, pick-your-own, tastings, farm stays, private hire, seasonal events + Hunting (18+). [S03 · T1; S14–S17 · T2]
8. Застосунки live: iOS 19.05.2026 (v1.0), Android 22.05.2026; 100+ установок; UGC + Messaging маркування. [S10, S11 · T1]
9. **Контентний шар: ком'юніті-стрічка (пости/підписки/лайки/коменти) існує; редакційного блогу і лонгітюдних журналів немає; контент публічно не індексується.** [S12, S10 · T1; S17 · T2; verified-absence перевірки · T1]
10. Об'єктна модель ширша за букінг: jobs board + product marketplace + shop уже в T&C (marketplace fee «to be confirmed»). [S03, S13 · T1]
11. Kaleb Cooper і Lisa Hogan мають профілі; Clarkson — «aspiring farmer» зі статусом-цитатою; Diddly Squat власних bookable experiences не виставила (на 09.06). [S15, S17, S19 · T2]
12. Запуск: юрдокументи 15–20.05 → застосунки 19–22.05 → founding-farmer-доступ 22.05 → медіахвиля 08–09.06, синхронна з S5 (03.06). [S03–S13 · T1; S14–S19 · T2]
13. Рецепція на зрізі: прес-критики платформи нуль; підтримки фермерських організацій нуль; галузева фермерська преса мовчить; UA/BG-покриття нуль. [нуль-результати, зафіксовані пошуками]
14. Роадмап-сигнали: TM 20.05.2026 — соцмережа, e-commerce, weddings/private hire, wellness, field-активності, farm-management SaaS; matchmaking із заявок 2026 зник. [S21, S22 · T3-дзеркало T1-реєстру]
15. Конкурентне поле UK (фактаж): Airbnb Exp. 20%, Pitchup 15%, Hipcamp 12.5%+VAT, Beyonk 4% B2B, membership-моделі без комісії (Farm Stay UK, CoolStays); прецедент Yonder (8%, зник) і Tentrr (ліквідація). [S37–S52 · T1/T2]

### 10.2. Неверифіковані сигнали (T3/T4 — поза ядром)
- Similarweb трав. 2026: 96 візитів (нижче порога вимірюваності). [S28 · T3]
- «Already has listings from multiple farms». [S18 · T3]
- JOE: «takes centre stage in the latest series» — конфліктує з консенсусом «coincides with»; непідтверджено. [S17 · T2-джерело, але claim одиничний]
- Цитата Adam Henson у dealxtop-передруку — провенанс не верифіковано. [S23a · T3]
- SEO-заголовок «Share Content Directly With Fans» — дисторсія. [S23 · T4]
- X @TheGriftReport — одиничний анонсний пост. [S31 · T4]
- TFF-цитати про Кларксона — сентимент-фон [A-сусід], не про платформу. [S29 · T4]
- Бентінк ≡ Хоган — інференція дослідника (збіг імені/адреси/ролі), без прямого документа.
- Австрія ~£12bn / Італія ~£17bn агротуризму — цитата без методології. [S46 · T2-цитата · обережно]

---

## 11. Глухі кути пошуку (нуль або сміття — першокласний результат)

1. **WHOIS onlyfarmers.co.uk** — Nominet/whois-сервіси заблоковані середовищем; дата реєстрації і реєстрант домену не встановлені.
2. **UKIPO case-сторінки** — Angular/JS, текст не віддається; повні класи зчитано лише з дзеркала TrademarkElite (T3); номер опозиційного провадження Only Farms і деталі опозиції — не встановлені.
3. **Wayback** — web.archive.org/web/* і CDX у блок-листі; availability API дав «0 снапшотів» для обох доменів; ретроспектива неможлива.
4. **Живий обхід SPA** (каталог, лічба лістингів, FAQ напряму, профілі Kaleb/Lisa, стрічка ком'юніті зсередини) — Chrome-сесія в цьому прогоні недоступна (розширення не підключене, 2 спроби); web_fetch віддає лише meta. → **Рекомендований наступний крок: ручна/браузерна сесія + реєстрація тестового акаунта.**
5. **Кількість лістингів** — не встановлена (нема sitemap, індексу, архіву, браузера; преса чисел не називає).
6. **Першоджерело анонсу** — конкретний пост IG/X Кларксона не здобуто (логін-стіни); прес-реліз як артефакт не знайдено; найраніша публікація — Independent 08.06 11:29 UTC.
7. **Соцакаунти платформи** — не виявлені пошуком; IG/TikTok/X недоступні фетчеру; @OnlyFarmers в X — у FarmersOnly.com [D].
8. **Reddit** — домен у блок-листі; 4 запити — нуль індексованих тредів про [A].
9. **Галузева фермерська преса** (FW, FG, NFU, FarmingUK, Agriland) — нуль матеріалів про платформу.
10. **Заблоковані домени** — thetimes.co.uk, thesun.co.uk, telegraph.co.uk, theguardian.com: можлива колонка Кларксона і оригінал The Sun не відкриті.
11. **NFU £170–660M** — першоджерело не локалізоване (лише цитата LADbible).
12. **NZ Herald** — два порожні fetch; `[лише сніпет]`.
13. **builtwith** — JS, не зчитаний; стек відновлено через DNS (§1.3).
14. **onlyfarmers.uk [B]** — NXDOMAIN; історія/реєстрант не встановлені; рамкове твердження про «сайт знайомств до того» не підтвердилося жодним слідом.
15. **Команда/вакансії/інвестори/агентство** — нуль публічних слідів; /careers — 404.
16. **Точний день травневого веб-запуску** — не встановлено (≈25.05 за «two weeks ago»).
17. **Коментарні секції видань і фермерські FB-групи** — недоступні/не індексуються; гостьова рецепція першої руки не зібрана.
18. **Mintel/Statista/VisitBritain** для UK-агротуризму — відкритих сторінок із числами не знайдено.
19. **UA/BG/DE/FR/PL/ES/IT-покриття** — цільові запити кожною мовою: нуль (зафіксовано як результат, не провал).
20. **IG-reel «Clarkson is calling on farmers to unite at Cereals 2026»** — потенційний supply-заклик у дні виставки (10–11.06); вміст за логін-стіною; зв'язок з Only Farmers неверифікований. → Кандидат на перевірку браузером.

---

## 12. Реєстр джерел

| ID | Джерело | URL | Дата | T |
|---|---|---|---|---|
| S01 | Companies House — Only Farmers Ltd (+officers, +PSC) | https://find-and-update.company-information.service.gov.uk/company/17058134 | fetch 10.06.2026 | T1 |
| S02 | Companies House — Curdle Hill Farm Ltd | https://find-and-update.company-information.service.gov.uk/company/12478400 | fetch 10.06.2026 | T1 |
| S03 | Terms & Conditions (eff. 19.05.2026) | https://www.onlyfarmers.co.uk/terms | fetch 10.06.2026 | T1 |
| S04 | Privacy Policy (upd. 15.05.2026) | https://www.onlyfarmers.co.uk/privacy | fetch 10.06.2026 | T1 |
| S05 | Головна (meta + рендер) | https://www.onlyfarmers.co.uk/ | fetch 10.06.2026 | T1 |
| S05a | onlyfarmers.com (порожньо) | https://onlyfarmers.com | fetch 10.06.2026 | T1 |
| S06 | Wayback availability (обидва домени → `{}`) | https://archive.org/wayback/available?url=onlyfarmers.co.uk | 10.06.2026 | T1 |
| S07 | dns.google — onlyfarmers.uk NXDOMAIN | https://dns.google/resolve?name=onlyfarmers.uk | 10.06.2026 | T1 |
| S08 | Legal hub (publ. 20.05.2026) | https://www.onlyfarmers.co.uk/legal | fetch 10.06.2026 | T1 |
| S09 | dns.google — CNAME links / A apex / TXT SPF | https://dns.google/resolve?name=links.onlyfarmers.co.uk&type=CNAME | 10.06.2026 | T1 |
| S10 | App Store GB — Only Farmers (id6764872237) | https://apps.apple.com/gb/app/only-farmers/id6764872237 | fetch 10.06.2026 | T1 |
| S11 | Google Play — com.teds.onlyfarms | https://play.google.com/store/apps/details?id=com.teds.onlyfarms | fetch 10.06.2026 | T1 |
| S12 | Deep-link хаб («browse the farmer community»; «App Store (Soon)») | https://links.onlyfarmers.co.uk/ | fetch 10.06.2026 | T1 |
| S13 | Farmer Onboarding Agreement + Fee Schedule (eff. 19.05.2026) | https://www.onlyfarmers.co.uk/farmer-onboarding-agreement | fetch 10.06.2026 | T1 |
| S14 | The Independent (Adam White; канон. b2991637; повний текст через AOL/inkl) | https://www.aol.co.uk/news/jeremy-clarkson-business-venture-easily-092424804.html | 08.06.2026 11:29 UTC | T2 |
| S15 | LADbible (Jen Thomas) | https://www.ladbible.com/entertainment/tv/jeremy-clarkson-only-farmers-website-clarksons-farm-990849-20260608 | 08.06.2026 15:55 | T2 |
| S16 | Evening Standard (Ekin Karasin; канон. b1285246; через Yahoo/AOL) | https://uk.news.yahoo.com/jeremy-clarkson-launches-own-version-121503952.html | 08.06.2026 12:15 UTC | T2 |
| S17 | JOE.co.uk (Harry Warner) — соцшар, FAQ, приклади лістингів | https://www.joe.co.uk/entertainment/jeremy-clarkson-launches-his-own-version-of-onlyfans-535539 | 08.06.2026 17:10 | T2 |
| S18 | News Minimalist (значущість 1,1/10) | https://www.newsminimalist.com/articles/jeremy-clarkson-launches-booking-platform-for-farm-experiences-3ac51c06 | 08.06.2026 | T3 |
| S19 | GB News (Lydia Davies) — комісії, назва, Diddly Squat | https://www.gbnews.com/celebrity/jeremy-clarkson-onlyfans-diddlysquat | 09.06.2026 08:12 | T2 |
| S20 | Cancellation & Refund Policy (eff. 19.05.2026) | https://www.onlyfarmers.co.uk/cancellation-refund-policy | fetch 10.06.2026 | T1 |
| S21 | TrademarkElite — UK00004219973 (+ S21a: UK00004391172) | https://www.trademarkelite.com/uk/trademark/trademark-detail/UK00004219973/Only-Farmers | 10.06.2026 | T3 (дзеркало T1-реєстру) |
| S22 | TrademarkElite — UK00004391243 (+ портфель Curdle Hill, 25 марок) | https://www.trademarkelite.com/uk/trademark/trademark-detail/UK00004391243/ONLY-FARMERS | 10.06.2026 | T3 |
| S23 | dealxtop SEO-клон («Share Content Directly With Fans»; + S23a: «unveils» з цитатою Henson) | https://discoverynewstoday.dealxtop.com/clarksons-farm/clarkson-introduces-new-platform-allowing-farmers-to-share-content-directly-with-fans/hs/ | 06.2026 | T3/T4 |
| S24 | Yahoo News UK (Lily Waddell) — TM-хвиля 2025 | https://uk.news.yahoo.com/jeremy-clarkson-matchmaking-onlyfarmers-dating-lisa-hogan-103326875.html | 01.07.2025 | T2 |
| S25 | NationalWorld (Jamie Jones) — TM-хвиля 2025 | https://www.nationalworld.com/culture/celebrity/jeremy-clarkson-online-dating-top-gear-star-trademarks-onlyfarmers-brand-5204244 | 01.07.2025 | T2/T3 |
| S26 | Дзеркало The Sun (SEO; «launched two weeks ago») | https://abcdailynews.dealxtop.com/clarson-farm/jeremy-clarkson-launches-cheeky-take-on-onlyfans-for-farmers-offering-countryside-experiences-you-never-knew-existed/hn/ | ~08.06.2026 | T3 |
| S27 | About Amazon — графік S5 (Emily Murray) | https://www.aboutamazon.com/news/entertainment/clarksons-farm-season-5-prime-video | 20.04.2026 | T1 |
| S28 | Similarweb — onlyfarmers.co.uk (трав. 2026) | https://www.similarweb.com/website/onlyfarmers.co.uk/ | знято 10.06.2026 | T3-оцінка |
| S29 | The Farming Forum — нитка «Clarksons farm» №438894 (стор. 1, 8, 9) | https://thefarmingforum.co.uk/threads/clarksons-farm.438894/page-9 | 04–10.06.2026 | T4 |
| S30 | VisitScotland — Thorabella Farm | https://www.visitscotland.com/info/see-do/thorabella-farm-p3062361 | 10.06.2026 | T2 |
| S31 | X @TheGriftReport | https://x.com/TheGriftReport/status/2063863600008323367 | ~08.06.2026 | T4 `[сніпет]` |
| S33 | X @onlyfarmers (= FarmersOnly.com, сутність D) | https://x.com/onlyfarmers | 10.06.2026 | T4 `[сніпет]` |
| S34 | The Guardian — рецензія S5 («Jeremy Kardashian»; цит. за S17) | https://www.theguardian.com/tv-and-radio/2026/jun/03/clarksons-farm-review-amazon-prime-video | 03.06.2026 | T2 |
| S35 | Metro — рецензія S5 (цит. за S17) | https://metro.co.uk/2026/06/03/clarksons-farms-new-season-proves-needs-end-28618721/ | 03.06.2026 | T2 |
| S36 | The Independent — «farmwashed his dodgy reputation» | (лінк із S14) | ~06.2026 | T2 |
| S37 | Airbnb Help 1857 — service fees | https://www.airbnb.co.uk/help/article/1857 | 10.06.2026 | T1 |
| S38 | Airbnb Newsroom — About (May 2026) | https://news.airbnb.com/about-us/ | 10.06.2026 | T1 |
| S39 | Hipcamp UK Help — комісія (upd. 18.08.2025) | https://support.hipcamp.com/hc/en-gb/articles/360024823412 | 10.06.2026 | T1 |
| S40 | Pitchup — join | https://www.pitchup.com/join/ | 10.06.2026 | T1 `[сніпет, Cloudflare 403]` |
| S41 | Feather Down Farms | https://www.featherdown.co.uk/ | 10.06.2026 | T1 |
| S42 | Farm Stay UK — Join / Legacy | https://www.farmstay.co.uk/join | 10.06.2026 | T1 |
| S43 | Beyonk — Pricing | https://www.beyonk.com/pricing | 10.06.2026 | T1 |
| S44 | CoolStays — Owners | https://www.coolstays.com/owners | 10.06.2026 | T1 |
| S45 | Canopy & Stars — Join the collection | https://www.canopyandstars.co.uk/join-the-collection/ | 10.06.2026 | T1 |
| S46 | The Scottish Farmer (Kate Fisher) — Agritourism Census 2025 | https://www.thescottishfarmer.co.uk/news/25670695.scottish-agritourism-sector-worth-292m-surpassing-2030-targets/ | 04.12.2025 | T2 |
| S47 | ShortTermRentalz — Yonder UK launch | https://shorttermrentalz.com/news/yonder-uk-launch/ | 06.05.2021 | T2 |
| S48 | yonder.com (тепер непов'язаний фінтех — доказ зникнення) | https://www.yonder.com | 10.06.2026 | T1 |
| S49 | Fodors — Tentrr | https://www.fodors.com/world/north-america/usa/new-york/experiences/news/my-town-fought-tentrr-and-won | — | T2 |
| S50 | OH Weekly — Tentrr rise and fall | https://ohweekly.substack.com/p/4-lessons-learned-from-the-rise-and | — | T3 |
| S51 | Harvest Hosts | https://harvesthosts.com | 10.06.2026 | T1 |
| S52 | WWOOF (федерація) | https://wwoof.net/ | 10.06.2026 | T1 |
| S53 | TrademarkElite — UK00004198121 (Only Farms) | https://www.trademarkelite.com/uk/trademark/trademark-detail/UK00004198121/Only-Farms | 10.06.2026 | T3 |
| S54 | mentoday.ru — RU-покриття | https://www.mentoday.ru/life/news/10-06-2026/djeremi-klarkson-zapustil-selskii-analog-onlyfans-chto-takoe-onlyfarmers/ | 10.06.2026 | T3 |
| S55 | UKIPO case-якір (JS, не рендериться) | https://trademarks.ipo.gov.uk/ipo-tmcase/page/Results/1/UK00004219973 | 10.06.2026 | T1-якір |

**Нуль-перевірені канали** (зафіксовано як результат): NFU Online, fwi.co.uk, farmersguardian.com, FarmingUK, Agriland, Farmers Guide; Daily Mail/Express/Mirror/Metro (про платформу); Reddit; українські, болгарські, німецькі, французькі, польські, іспанські, італійські медіа.

---

## Самоаудит виконання (протокольний)

- **Валентна симетрія:** негатив шукався 6 окремими запитами → зафіксовано «нуль прес-критики платформи» поряд із «нуль формальної підтримки фермерських організацій»; фоновий скепсис до бренду Кларксона (Guardian/Metro/Independent/TFF) включено і маркований як [A-сусід]; позитивні умови для фермерів подані з джерелами. Асиметрії не виявлено.
- **Конфлікти джерел показані, не усереднені:** дати TM-подач (±1 день, двічі); «opposed» vs «Withdrawn»; «launched in May» vs «within days of S5»; «App Store (Soon)» vs живі стори; JOE «centre stage» vs консенсус «coincides»; eligibility UK/EEA vs «visitors from around the world»; £300-поріг (FAQ) vs юрдокументи.
- **Міжагентний конфлікт розв'язано первинною верифікацією:** наявність застосунків підтверджена прямими fetch обох сторінок сторів (T1) — потоки, що рапортували відсутність, спиралися на сторовий пошук, а не на прямі URL.
- **Контамінація сутностей:** перевірено — факти [B]/[C]/[D] ізольовані; жоден продуктовий факт [A] не походить із джерел про [B]/[C]/[D].
- **Числа без джерел:** відсутні — всі «не встановлено» марковані явно (комісія знайдена з джерелом; кількість лістингів чесно не встановлена).

