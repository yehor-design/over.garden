# GEO/AEO/LLM-SEO — ДЕЛЬТА-ДОСЛІДЖЕННЯ для OverGarden (v1)

**Дата:** 2026-06-15. **Мови пошуку:** EN (база поля) + UA + BG. **Метод:** 5 паралельних потоків веб-розвідки, потім незалежна перевірка 4 найбільш навантажених/несподіваних тверджень безпосередньо в першоджерелі.
**Формат:** каталог дискретних записів за темами 1–7 (не есе). Кожне навантажене твердження = інлайн-провенанс (джерело · робоче посилання · дата · тір) + крос-аналіз-тег + рядок «що це значить для OverGarden».

**Тіри надійності:** **T1** первинне (офіційні доки краулерів, рецензовані/arXiv статті, специфікації, самі файли robots.txt). **T2** незалежне дослідження з розкритим методом/вибіркою. **T3** вендорський/інструментальний SEO-блог (орієнтовно). **T4** форум/анекдот.
**Крос-аналіз-теги** (відносно вже зафіксованого в UA-19/BG-19): **ПІДТВЕРДЖУЄ** · **РОЗШИРЮЄ** · **СУПЕРЕЧИТЬ** · **ПРОГАЛИНА**.

**Baseline (НЕ переказую — лише позначаю дельту):** AIO +35% CTR цитованим (Seer); експеримент SEL 09.2025 (лише сторінка з повним JSON-LD потрапила в AIO-цитування); 65% AI-цитованих сторінок мають structured data (Seranking); Reddit ~37% US-видачі / 49.4% AIO; iNaturalist 6.5M/міс ≈ 5–6× форуму; пріоритет схем DiscussionForumPosting+ProfilePage (#1), AggregateRating (#2), Bioschemas Taxon (щілина); HowTo deprecated 09.2023, FAQPage deprecated 05.2026.

---

## ⚡ НАЙВАЖЛИВІШІ ДЕЛЬТИ (що змінює рішення)

1. **UA AIO-покриття вдвічі менше припущеного, BG — суттєво позаду.** Україна = 15.5% усіх запитів (не 30–50%), Болгарія не входить у топ-50 країн (нижче ~8.7%). → тема 1.
2. **Обрані схеми НЕ підтверджені як важіль AI-цитування.** Контрольований тест (Search Atlas, 12.2025) показав нуль приросту цитування від schema-покриття; чат-боти не читають JSON-LD при live-fetch (searchVIU). Схеми виправдані Google-rich-results + entity-гігієною, **не** AI-цитуванням. → тема 3.
3. **Теза «proof-data/свіжість AI-стійкі» — ЧАСТКОВО підтверджена, але НЕ в сильній формі.** Свіжість і information-gain реальні; але домінантний висновок 2025–26 — AI цитує за вже наявним брендовим авторитетом / топ-10 / згадками, яких у DR=0 сайту немає. Якість даних — необхідна, але не достатня. → теми 4, 5.
4. **Observation-бази (iNaturalist/GBIF/eBird) AI майже не цитує.** AI цитує Wikipedia/Wikidata + Reddit/YouTube. iNaturalist сам не претендує на AI-цитування; AllTrails у ChatGPT — це партнерство, не органіка. Реалістичний шлях для фактів про сорти/регіони — у Wikidata/Wikipedia. → тема 4.
5. **Реальна можливість: «кириличний Reddit-вакуум».** US-плейбук «Reddit домінує в AI» імовірно інвертується в UA/BG (немає кириличного форуму Reddit-масштабу) → вільний слот цитування, який структурований локальний UGC може зайняти. Гіпотеза за аналогією, не виміряна для кирилиці. → теми 1, 5.
6. **robots.txt захищає лише шар індексації, не приватність.** ChatGPT-User, Perplexity-User, Meta-fetchers, Bytespider документовано ігнорують robots.txt → гео-чутливе мусить бути за автентифікацією (server-side 401/403). Блокування Google-Extended НЕ виводить з AIO (лише з тренування Gemini) — це пастка. → тема 2.
7. **Cold-start: тижні до першого цитування на long-tail можливі** (live-retrieval + answer-first + schema + індексація в Bing), але впізнавання сутності — місяці-роки; Knowledge Panel не можна «зробити»; Wikidata-айтем — найдешевший entity-важіль, який можна створити самому. → тема 6.
8. **Інструменти виміру — англоцентричні.** Найдешевший (Otterly) — найслабший для не-англ.; Peec AI найімовірніший платний (без мовної доплати), але не перевірений на кирилиці; ручний метод носіями мови — водночас найдешевший і найдостовірніший для UA/BG. → тема 7.

---

## ТЕМА 1 — Поведінка AI-движків у кирилиці / UA / BG

**[1.1] Google AI Overviews офіційно живий в Україні з травневої хвилі I/O 2025 (200+ країн, 40+ мов, укр. включно); користувачі бачать AIO ~з 15–21.05.2025.** Google «AI Overviews… 200+ countries… 40+ languages», https://blog.google/products-and-platforms/products/search/ai-overview-expansion-may-2025-update/ (травень 2025, **T1**); підтвердження UA: dev.ua https://dev.ua/en/news/ai-overviews-1747812798 та RBC-Ukraine https://newsukraine.rbc.ua/news/ukraine-gets-google-s-ai-search-what-s-new-1747825900.html (05.2025, **T3**). → **РОЗШИРЮЄ**. Значення: AIO в UA — не «вікно раннього доступу», а вже ~13 міс. у проді; оптимізувати треба зараз.

**[1.2] ⭐ Україна = 31 місце, AIO присутній у 15.5% усіх запитів (699 тис. із 4.5 млн ключів). Болгарія ВІДСУТНЯ в топ-50 (поріг #50 = Греція 8.7%).** Ahrefs Brand Radar, 108 млн AIO-запитів, https://ahrefs.com/blog/ai-overviews-international/ (2025-11-04, **T2**). *Перевірено в першоджерелі 2026-06-15: таблиця підтверджена дослівно.* → **СУПЕРЕЧИТЬ** baseline «30–50% на UA-садівництві». Значення: найзахищеніше число для UA = **15.5% усі-запити**; садівництво може бути вище середнього (див. 1.5), але цифру 30–50% треба трактувати як «лише садова вертикаль, неперевірено» і переміряти. Болгарія — матеріально менший/пізніший AIO-ринок.

**[1.3] ⭐ Англійська = 52.75% усіх AIO у світі; російська #7 (2.67%); української та болгарської немає в топ-10 мов.** Ahrefs, те саме джерело (**T2**, перевірено). → **ПРОГАЛИНА/СУПЕРЕЧИТЬ**. Значення: тонке постачання AIO рідними UA/BG → менше конкурентів за слот цитування, але й менше загальних AIO-показів. Конфаунд: значна частина «кириличного» пошуку в UA може вестися російською, де постачання AIO ~втричі багатше.

**[1.4] ⭐ Мова запиту (не країна) — домінантна сила, що переформатовує цитування; але ЖОДНОЇ кириличної/слов'янської мови не тестовано.** Profound, 3.25 млрд цитувань, 7 моделей, 14 країн, https://www.tryprofound.com/blog/how-query-language-reshapes-ai-citations (2026-04, **T2**). Тестовані: EN, DE, FR, IT, ES, PT, JP, SV, HI, AR — без UA/BG/RU. Ключове за аналогією: «соціальний шар» ChatGPT — це фактично Reddit-конвеєр (51–76% соц-цитувань), який «тоншає» в не-англ. ринках. → **ПРОГАЛИНА (головна) + РОЗШИРЮЄ за аналогією**. Значення: baseline «Reddit домінує в AI» ймовірно НЕ переноситься на UA/BG → вакуум цитування, який структурований локальний UGC міг би заповнити. Шведський прецедент (мала європ. мова, де AIO «майже стирає» соц-цитування) — найближчий і застережливий аналог.

**[1.5] Вертикаль «Home & Garden» тригерить AIO у 50.4% запитів — друга з 20 (після Health 60.7%).** NP Digital, 8 млн запитів/38 країн, через SeoProfy https://seoprofy.com/blog/google-ai-overviews/ (**T3**, оригінал ~T2). → **РОЗШИРЮЄ/частково ПІДТВЕРДЖУЄ**. Крос-країнно, не UA/BG. Значення: домен OverGarden — одна з двох найбільш AIO-насичених вертикалей; AIO — це поле бою, не побічна функція.

**[1.6] Long-tail (сорт×регіон) — там, де AIO концентрується: 7+-слівні запити тригерять AIO у 46.4% проти 9.5% для 1-слівних; 68% AIO-ключів мають ≤100 запитів/міс.** Semrush 10M+ ключів через SeoProfy (**T3/T2**). → **РОЗШИРЮЄ**. Значення: прямо підтримує long-tail-тезу «сорт×регіон» — форма запиту, на яку націлені структуровані записи журналів, і де AIO найгустіший.

**[1.7] Движки ГЕНЕРУЮТЬ багату цитовану українську видачу — вся UA-техпреса розбирає патерни помилок AIO.** ain.ua https://ain.ua/2026/04/13/naskilki-tocni-si-ogliadi-vid-google/, texty.org.ua https://texty.org.ua/fragments/117215/ та ін. (04.2026, **T3**, переказ дослідження Oumi/NYT на 4 326 запитах). Суть: точність AIO 85% (Gemini 2, 10.2025) → 91% (Gemini 3, 02.2026); >половини «правильних» — «непідтверджені»; AIO регулярно цитує Facebook/Reddit і піддається маніпуляції. → **ПІДТВЕРДЖУЄ (видача багата, не порожня) + РОЗШИРЮЄ**. Значення: для UA відповідь на «багато vs порожньо» = **багато**; структурований журнал із джерелами позиціонований бути *кращим* (цитованішим/верифіковнішим) джерелом, ніж Facebook/форум-пости, на які AIO зараз спирається.

**[1.8] UA/BG — НЕ катастрофічно виключені мови; Європа «переважно синя», цифрова присутність перевищує популяцію носіїв.** Khanna & Li, «Invisible Languages of the LLM Universe», arXiv:2510.11557, https://arxiv.org/html/2510.11557v1 (2025-10-13, **T1** препринт). → **СУПЕРЕЧИТЬ** будь-якому страху «кирилиця приречена». Значення: обмеження OverGarden — це розмір ринку, щільність конкуренції та зрілість розгортання, а НЕ нездатність Gemini у кирилиці (Gemini 2.5 Pro — топ на укр. перекладі, machinetranslation.com, **T3**).

**[1.9] Perplexity відкочується до англ./конкурентних/застарілих джерел для не-англ. запитів, коли локальне покриття тонке або hreflang слабкий.** Trakkr https://trakkr.ai/article/multi-language-setup-for-perplexity (2026, **T3** вендор). → **РОЗШИРЮЄ**. Значення (директивно, не виміряно для UA/BG): бути єдиним добре-структурованим рідномовним джерелом підвищує шанси цитування, але тонке постачання означає, що движок дефолтить до англ., якщо твої hreflang/рідномовні сторінки не чисті.

**[1.10] «13.14% Болгарія, березень 2025» — фантомне число (це ГЛОБАЛЬНА цифра Semrush, не болгарська).** Трасування: infoz.bg https://www.infoz.bg/world/13912-... (2026-01-27, **T3**) — усі заголовкові числа глобальні/US, без розбивки по Болгарії. → **ПРОГАЛИНА (спростовано)**. **НЕ ПІДТВЕРДЖЕНО:** жодного болгарсько-специфічного % покриття AIO немає; жорстка межа з [1.2] — Болгарія нижче ~8.7%. Не цитувати 13.14% як болгарське.

---

## ТЕМА 2 — AI-краулери: керування через robots.txt (пусти публічне, закрий приватне)

> Усі токени нижче — з офіційних доків краулерів (**T1**), звірених 2026-06-15.

**[2.1] OpenAI: 3 незалежні токени — тренування / пошук / live-fetch.** `GPTBot` (тренування), `OAI-SearchBot` (показ+цитування в ChatGPT-пошуку), `ChatGPT-User` (live-fetch на запит юзера). OpenAI дослівно: «Because these actions are initiated by a user, robots.txt rules **may not apply**» (про ChatGPT-User). https://developers.openai.com/api/docs/bots (**T1**). → **РОЗШИРЮЄ**. Значення: дозволь `OAI-SearchBot`, заборони `GPTBot` — отримуєш цитування без донорства тренувальних даних; `ChatGPT-User` Disallow для приватного НЕ покладатися.

**[2.2] Anthropic: усі 3 токени поважають robots.txt, ВКЛЮЧНО з user-fetcher.** `ClaudeBot` (тренування), `Claude-User` (live на запит), `Claude-SearchBot` (індекс пошуку). «respect 'do not crawl'… honoring industry standard directives in robots.txt». https://support.claude.com/en/articles/8896518 (2026-04-07, **T1**). → **РОЗШИРЮЄ + конфлікт**: Anthropic — виняток, його `Claude-User` слухає robots.txt (на відміну від ChatGPT-User/Perplexity-User). Застарілі `Claude-Web`/`anthropic-ai` — не використовувати.

**[2.3] Perplexity: `PerplexityBot` слухає; `Perplexity-User` документовано ІГНОРУЄ robots.txt.** «Since a user requested the fetch, this fetcher **generally ignores robots.txt** rules». Заблокована сторінка все одно може отримати індекс «domain, headline, and a brief factual summary». https://docs.perplexity.ai/docs/resources/perplexity-crawlers + https://www.perplexity.ai/help-center/en/articles/10354969 (**T1**). → **РОЗШИРЮЄ**. Значення (важливо для гео-ризику): навіть заблокована публічна сторінка може засвітити ЗАГОЛОВОК/URL — тримай чутливі рядки поза title/URL.

**[2.4] Google: блокування `Google-Extended` НЕ виводить з AI Overviews / AI Mode (лише з тренування Gemini + grounding).** Дослівно: «Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal». AIO/AI Mode годуються Googlebot/Search-індексом. https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers (2026-04-23, **T1**). → **РОЗШИРЮЄ (розв'язує пастку питання №4)**. Значення: щоб бути в AI-поверхнях Google — тримай `Googlebot` дозволеним; вийти з AIO через Google-Extended НЕ можна (лише `nosnippet`/`max-snippet` мета — окремий важіль).

**[2.5] Google user-triggered fetchers (NotebookLM, Google-Agent тощо) ІГНОРУЮТЬ robots.txt.** https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers (2026-05-08, **T1**). → **РОЗШИРЮЄ**. Значення: той самий урок — для приватного лише автентифікація.

**[2.6] Meta: популярне «Meta-ExternalAgent = AI» НЕПОВНЕ.** `Meta-ExternalAgent` = тренування/індексація для продуктів; `Meta-WebIndexer` = покращує **Meta AI search** і «helps us cite and link to your content» (це citation-бот); `Meta-ExternalFetcher` + `FacebookExternalHit` можуть **обходити** robots.txt. https://developers.facebook.com/docs/sharing/webmasters/web-crawlers (**T1**). → **СУПЕРЕЧИТЬ** ходовому T3-резюме. Значення: дозволь `Meta-WebIndexer`, заборони `Meta-ExternalAgent`.

**[2.7] Bytespider (ByteDance) — документовано ІГНОРУЄ robots.txt (контр-доказ, офіційного T1 нема).** botdetector.io, aicw.io (**T3/T4**). **НЕ ПІДТВЕРДЖЕНО** офіційним доком ByteDance. → **ПРОГАЛИНА**. Значення: Disallow = декларація наміру; реальне виключення — лише CDN/WAF.

**[2.8] robots.txt `noindex` Google НЕ підтримує; заборонена (Disallow) сторінка все одно може індексуватися, якщо на неї є посилання.** «Specifying `noindex` in robots.txt is not supported… page must not be blocked by robots.txt» (інакше краулер не побачить noindex). https://developers.google.com/search/docs/crawling-indexing/block-indexing (2025-12-10, **T1**). → **РОЗШИРЮЄ**. Значення: приватне = автентифікація (401/403); «краулити-але-не-лістити» = дозвол краулу + `X-Robots-Tag: noindex`; публічні журнали = дозвол + реальний SSR-контент.

**[2.9] Автентифікація — єдиний механізм проти fetcher-ів, що ігнорують robots.txt.** Синтез T1: ChatGPT-User [2.1], Perplexity-User [2.3], Meta-fetchers [2.6], Google user-triggered [2.5] + Bytespider [2.7]. → **РОЗШИРЮЄ (несуче для GDPR Art.25 + воєнний гео-ризик)**. Значення: точні координати ніколи не в тілі відповіді неавтентифікованому запиту, не в публічному URL, не в sitemap, не в title/meta.

**[2.10] Живі приклади аналогів (T1, файли звірені):** iNaturalist https://www.inaturalist.org/robots.txt блокує набір AI-ботів (Amazonbot, Applebot-Extended, Bytespider, CCBot, ClaudeBot, Google-Extended, GPTBot, meta-externalagent) + Content-Signal `search=yes, ai-train=no` (EU CDSM Art.4) + Disallow query-string і експортів; Medium https://medium.com/robots.txt блокує тренувальні, лишає Googlebot/OAI-SearchBot; Substack https://substack.com/robots.txt Disallow `/feed/private`, явний Allow `facebookexternalhit`. → **РОЗШИРЮЄ**. Значення: пряма матриця-шаблон (нижче). **НЕ ПІДТВЕРДЖЕНО** (не звірено в цій сесії): точні файли Reddit/Wikipedia/Quora/StackOverflow.

**[2.11] Блокування тренувальних краулерів майже не знижує AI-цитування; над-блокування коштує трафіку.** BuzzStream (4 млн цитувань, новинні сайти): блок `GPTBot` → все одно цитовані у 88.2% випадків; блок `Google-Extended` → 92.3%. https://www.buzzstream.com/blog/news-block-ai-bots-citations (2026-03, **T2**). Окремо: видавці, що блокували AI-краулери, втратили −23.1% візитів (Rutgers/Wharton через PPC.land, **T3**, **НЕ ПІДТВЕРДЖЕНО** в першоджерелі). → **РОЗШИРЮЄ**. Значення: не над-блокувати; дефолт — дозвіл search/retrieval-ботів, блок лише тренувальних + абʼюзерів. (Дані з новинних сайтів, перенос на нішевий садовий UGC — не доведено.)

### Токен-таблиця (звірено з офіційними доками, 2026-06-15)
| Токен | Вендор | Призначення | Слухає robots.txt | Джерело (тір) |
|---|---|---|---|---|
| `GPTBot` | OpenAI | тренування | ТАК | developers.openai.com/api/docs/bots (T1) |
| `OAI-SearchBot` | OpenAI | пошук/цитування | ТАК | те саме (T1) |
| `ChatGPT-User` | OpenAI | live-fetch | **НІ** | те саме (T1) |
| `ClaudeBot` | Anthropic | тренування | ТАК | support.claude.com/.../8896518 (T1) |
| `Claude-SearchBot` | Anthropic | пошук | ТАК | те саме (T1) |
| `Claude-User` | Anthropic | live-fetch | **ТАК** | те саме (T1) |
| `PerplexityBot` | Perplexity | пошук (не тренування) | ТАК | docs.perplexity.ai/.../perplexity-crawlers (T1) |
| `Perplexity-User` | Perplexity | live-fetch | **НІ** | те саме (T1) |
| `Googlebot` | Google | пошук-ядро → також AIO/AI Mode | ТАК | developers.google.com/.../google-common-crawlers (T1) |
| `Google-Extended` | Google | тренування Gemini + grounding; **НЕ впливає на AIO/Search** | ТАК (контроль-токен) | те саме (T1) |
| `CCBot` | Common Crawl | тренування-апстрим | ТАК | commoncrawl.org/ccbot (T1) |
| `Meta-ExternalAgent` | Meta | тренування/індекс | ТАК | developers.facebook.com/.../web-crawlers (T1) |
| `Meta-WebIndexer` | Meta | пошук/цитування Meta AI | ТАК | те саме (T1) |
| `Meta-ExternalFetcher` | Meta | live-fetch | **НІ** (може обходити) | те саме (T1) |
| `Bytespider` | ByteDance | тренування | **НІ** (репортовано) | botdetector.io (T3) — НЕ ПІДТВЕРДЖЕНО офіц. |
| `Bingbot` (Bing AI/Copilot) | Microsoft | пошук-ядро → Copilot | імовірно ТАК | НЕ ПІДТВЕРДЖЕНО в першоджерелі |

### Рекомендований скелет robots.txt (кожна директива має цитоване офіційне підґрунтя; `# BEST-EFFORT` = лише декларація наміру)
```
# Приватність — server-side (401/403), НЕ цей файл.
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no   # BEST-EFFORT (Cloudflare/EU CDSM; як iNaturalist, T1)
Disallow: /drafts/
Disallow: /*/edit$
Disallow: /settings/
Disallow: /account/
Disallow: /api/
Disallow: /search
Disallow: /*?*            # без query-string URL (патерн iNaturalist, T1)
Disallow: /*.json$
Disallow: /*.csv$
Allow: /

# Пошукові/цитувальні боти — ДОЗВІЛ (придатність до цитування)
User-agent: OAI-SearchBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Meta-WebIndexer
Allow: /
# Googlebot НЕ блокувати → тримає Search + AIO/AI Mode (T1)

# Тренувальні/архівні — ЗАБОРОНА (слухаються згідно доків)
User-agent: GPTBot
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: Google-Extended      # тренування Gemini; НЕ впливає на AIO (T1)
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: Meta-ExternalAgent
Disallow: /

# Відомий не-комплаєр — лише декларація; ENFORCE на CDN/WAF
User-agent: Bytespider           # ігнорує robots.txt (T3) # BEST-EFFORT
Disallow: /

# ChatGPT-User / Perplexity-User / Meta-ExternalFetcher ігнорують robots.txt → НЕ покладатися; приватне лише за auth.
Sitemap: https://<domain>/sitemap-public.xml   # лише публічні URL
```

---

## ТЕМА 3 — Чи піднімають обрані схеми AI-ЦИТУВАННЯ (а не лише Google rich results)

**[3.1] ⭐ КОНТР-ДОКАЗ: контрольований тест — НУЛЬ приросту цитування від schema-покриття.** Домени з 100% schema цитуються AI НЕ частіше за домени з 0%; розподіли видимості «майже ідентичні від No Schema до Full Schema» на OpenAI/Gemini/Perplexity. Search Atlas (Manick Bhan), https://searchatlas.com/blog/limits-of-schema-markup-for-ai-search/ (2025-12-14, онов. 2026-01-26, **T2**). *Перевірено в першоджерелі 2026-06-15.* Обмеження (заявлені самим автором): міряли *присутність*, не тип/якість; кореляційне, не причинне; 3 платформи. → **СУПЕРЕЧИТЬ** baseline «65% AI-цитованих мають schema» (це кореляція приналежності до пулу, не приріст) і всім «3.2×/2.5×» вендорським твердженням. Значення: schema сама по собі НЕ купує AI-цитувань. (Тип не тестовано → не спростовує, що конкретний тип міг би мати ефект; спростовує «більше схеми = більше цитувань».)

**[3.2] КОНТР-ДОКАЗ: чат-боти НЕ читають JSON-LD при прямому fetch.** Ціна, схована лише в JSON-LD (невидима на сторінці), знайдена 0 з 5 систем (ChatGPT/Claude/Gemini/Perplexity/AI Mode); видобувався лише видимий HTML. searchVIU, https://www.searchviu.com/en/schema-markup-and-ai-in-2025-what-chatgpt-claude-perplexity-gemini-really-see/ (тест 2025-10-30, **T2**). Нюанс автора: це лише Phase-4 (live-fetch); schema може використовуватись на індекс-етапі (Google AIO, Bing/Copilot). → **СУПЕРЕЧИТЬ** «AI читає твій JSON-LD» + **РОЗШИРЮЄ** (розділення fetch-time vs index-time). Значення: факти, які треба цитувати, — у видимому SSR-HTML, ніколи не лише в JSON-LD.

**[3.3] Google первинно: «no special optimization for AI features»; перевага schema — для SEARCH RESULTS.** Search Central Live Madrid (2025-04-09): AIO через RAG+grounding; «no optimization is necessary for Google AI features»; structured data дає перевагу «in search results». SEJ (репорт Aleyda Solis, вбудовані твіти), https://www.searchenginejournal.com/google-confirms-structured-data-still-essential-in-ai-search-era/544141/ (2025-04-10, **T1**). → **КОНТЕКСТУАЛІЗУЄ** baseline. Значення: не обґрунтовувати схему як «Google підтвердив буст AIO-цитувань» — офіційна лінія протилежна.

**[3.4] Mueller: schema для LLM — «yes, no, and it depends»; багато типів — «wishful thinking».** «…other structured data types, there's a lot of wishful thinking… your 'best insurance comparison site' isn't going to rank better by adding insurance markup.» SERoundtable, https://www.seroundtable.com/mueller-schema-helps-llms-google-40693.html (2026-01-02, **T1-особисте**). → **СУПЕРЕЧИТЬ** максималістській тезі. Значення: пряме застереження проти ставки на нішеву розмітку (Bioschemas Taxon) як важіль цитування.

**[3.5] Bing/Copilot (підтверджено вендором): schema допомагає LLM РОЗУМІТИ контент.** Fabrice Canel (Microsoft), SMX Munich 03.2025; Bing інжестить JSON-LD у knowledge graph для розуміння/дизамбігуації; «Gen AIs value fresh content… use IndexNow». SEL, https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455 (2025-03-20, **T1-атрибутовано**). → **РОЗШИРЮЄ**. Дієслово — «understand», НЕ «cite more». Значення: schema має роль для розуміння/дизамбігуації (Bing годує веб-результати ChatGPT); IndexNow + freshness — конкретний actionable для журнал-стріму.

**[3.6] Єдина рецензована опора — про структурований ПРОМПТ, не веб-JSON-LD.** LLM точніше видобувають з структурованих полів. Nature Communications (02.2024), https://www.nature.com/articles/s41467-024-45563-x (**T1**). → **РОЗШИРЮЄ**. Значення: механізм правдоподібний, але ланцюг «твій JSON-LD пережив краул → керує видобуванням → підняв цитування» не доведений поза Bing/Google-індексом.

**[3.7] Найчесніший синтез (Semrush-видання): schema не гарантує цитувань; AI-релевантні типи — Organization/Person/Product (entity identity), не екзотика контенту.** SEL, https://searchengineland.com/schema-markup-ai-search-no-hype-472339 (2026-03-25, **T2/T3**). → **СУПЕРЕЧИТЬ** хайпу. Значення: захищена AI-релевантна робота — `@graph`/`@id`/`sameAs` граф сутностей (Organization + Person/author), якого команда НЕ пріоритизувала.

### Поспецифічна оцінка обраних ставок (ядро запиту)
| Тип схеми | Google rich result | Доказ AI-цитування | Вердикт |
|---|---|---|---|
| **DiscussionForumPosting** | ЖИВИЙ rich result для форумів (T1 Google docs) | НЕМАЄ контрольованого доказу приросту AI-цитування; Reddit цитується через авторитет/угоду, не розмітку | **Виправдано Google-rich-result; AI-цитування = лише вендорське твердження** |
| **ProfilePage** | ЖИВИЙ rich result (пара до DiscussionForumPosting) | НЕМАЄ доказу AI-приросту (Person-сутність правдоподібно корисна, але не цей тип) | **Виправдано rich-result/author-entity; AI-цитування — нема доказу** |
| **Bioschemas Taxon** | НЕ Google rich result; робить сторінки знаходними в **Google Dataset Search** (T1 bioschemas.org) | НЕМАЄ доказу, що AI цитує через Taxon-розмітку; «незайнята щілина» може = «невинагороджувана» | **Виправдано Dataset Search/інтеграцією даних; AI-цитування — нема доказу; застереження Mueller [3.4] найбільше тут** |
| **schema.org Observation** | НЕ rich result; сам schema.org класифікує як «new»/низьке прийняття (T1) | НЕМАЄ доказу AI-використання; низьке прийняття | **Нема rich result, нема AI-доказу, низьке прийняття — найнижчий пріоритет** |
| **ImageObject + EXIF/гео** | Підтримує image rich results/ліцензування (T1) | НЕМАЄ доказу, що EXIF/гео в розмітці піднімає AI-цитування (AI розуміє зображення з пікселів + видимих підписів) | **Виправдано image-licensing/rich-result; AI-цитування — нема доказу** |

**Підсумок теми 3:** усі 5 обраних типів виправдані Google-rich-result-придатністю та/або entity/data-гігієною — НЕ контрольованим доказом приросту AI-цитування. Найзахищеніша AI-релевантна робота — `Organization + Person/author @graph/@id/sameAs` граф (не пріоритизований). DiscussionForumPosting/ProfilePage лишити для форумних rich results, Taxon — для Dataset Search; але припинити трактувати їх як важелі AI-цитування.

---

## ТЕМА 4 — Структуровані observation-бази як джерело для AI

**[4.1] ⭐ КОНТР-ДОКАЗ: observation-бази ВІДСУТНІ серед топ-цитованих доменів.** Топ-10 цитованих (ChatGPT/Perplexity/Gemini/AI Mode/AIO, 28-дн.): youtube.com (22.6%), reddit.com (19.8%), google, instagram, facebook, linkedin, tiktok, apple, wikipedia.org (2.25%), elpais. **Жодного iNaturalist/GBIF/eBird/AllTrails.** LLM Pulse, https://llmpulse.ai/data-studies/top-cited-domains (2026-06-13, **T3**). → **СУПЕРЕЧИТЬ** припущенню «структуровані nature-дані = велике джерело AI». Значення: на макрорівні observation-дані — у кращому разі long-tail/нішеве джерело.

**[4.2] Wikipedia домінує; observation-бази невидимі (більший датасет).** Wikipedia ≈ 8% усіх AI-цитувань (#1); Reddit ≈ 1.8%. Profound (680 млн цитувань) через Semrush/Visual Capitalist (2025, **T3**). → **ПІДТВЕРДЖУЄ** [4.1]. Значення (відповідь «чому цитують»): цитується **центральний курований сильно-залінкований knowledge graph (Wikipedia/Wikidata)**, не розподілені observation-записи.

**[4.3] Wikidata/structured KG використовуються для GROUNDING (механізм «чому»).** LLM заземлюються у Wikidata/DBpedia (embeddings/tool-calling) для зниження галюцинацій. Wikimedia Diff https://diff.wikimedia.org/2025/07/23/making-question-answering-systems-smarter-with-knowledge-graphs-using-frog-... (2025, **T1/T2**). → **РОЗШИРЮЄ**. Значення: реальний шлях «бути цитованим за факти про сорти/регіони» = завести таксони/регіональні факти у Wikidata/Wikipedia (або заробити посилання на свої агрегаційні сторінки звідти), а не чекати, що AI знайде сирі журнали.

**[4.4] iNaturalist у власному звіті впливу НЕ згадує AI-цитування жодного разу.** 290M спостережень, ~7 000 наук. статей, #1 контриб'ютор GBIF — вплив рамкований як наука/conservation/computer-vision. iNaturalist blog https://www.inaturalist.org/blog/123031-impact-highlights-from-2025 (2026-01-13, **T1**). → **ПРОГАЛИНА**. Значення: «бути цитованим AI як iNaturalist» — не ціль, яку iNaturalist переслідує чи відстежує; аналогія підтримує *data-network/UGC-корпус*-модель, а не *AI-citation*-модель.

**[4.5] iNaturalist↔GBIF↔LLM — про СПОЖИВАННЯ даних, не ЦИТУВАННЯ сайту.** Дослідники використовують GPT-4 для *обробки* GBIF/iNaturalist-даних; iNaturalist годує GBIF; найцитованіший датасет GBIF (~7 000 статей) — це *наукове* цитування. arXiv 2504.18651; BioScience 2025 (**T1/T2**). → **РОЗШИРЮЄ/уточнює**. Значення: observation-дані ризикують бути *інжестованими як тренувальні/tool-дані без атрибуції*, а не цитованими — підсилює стратегію robots.txt/ліцензування (тема 2) над citation-ставкою.

**[4.6] AllTrails у ChatGPT — через ПАРТНЕРСТВО, не органічне цитування.** «AllTrails in ChatGPT» — офіційна інтеграція/застосунок. https://www.alltrails.com/press/introducing-alltrails-in-chatgpt (**T1**). → **СУПЕРЕЧИТЬ** інференсу «структуровані location-дані → органічне AI-цитування». Значення: не моделювати AllTrails як доказ органіки — це B2B-угода, недоступна пре-лонч стартапу.

**[4.7] Bioschemas Taxon: реальний шлях у Google Dataset Search, не в AI-цитування.** BISS/Pensoft https://biss.pensoft.net/article_preview.php?id=25836 (**T1**). → **РОЗШИРЮЄ** [3-таблицю]. Значення: якщо брати Taxon — обґрунтовувати Dataset Search + інтероперабельністю біо-даних (правдоподібна ніша), не AI-цитуванням.

**Підсумок теми 4:** AI-движки **істотно НЕ цитують** observation-бази. Цитують Wikipedia/Wikidata (курований grounding-KG) + Reddit/YouTube (авторитетний UGC). Реалістичний citation-маршрут OverGarden для фактів про сорти/регіони = **у Wikipedia/Wikidata + заробляння посилань/авторитету**, плюс Bioschemas Taxon для **Dataset Search**.

---

## ТЕМА 5 — Proof-data / свіжість як важіль для AI (теза проєкту)

**[5.1] Princeton GEO: статистика + цитати + лапки причинно піднімають видимість у генеративній видачі — «понад 40%».** Aggarwal et al., «GEO: Generative Engine Optimization», arXiv:2311.09735 (v1 2023-11; v3 2024-06; KDD'24), https://arxiv.org/abs/2311.09735 (**T1**). На Perplexity до 37%. → **ПІДТВЕРДЖУЄ тезу (концептуально)**. ⚠ **STALE-флаг:** експерименти на GPT-3.5-class движках до сучасних retrieval-архітектур; метрика «Position-Adjusted Word Count» синтетична, не реальні цитування 2026. **НЕ ПІДТВЕРДЖЕНО** точні per-method числа (вторинні джерела конфліктують: Cite +30..+40, Stats +32..+37, Quote +22..+41) — відкрити PDF Table-2: https://arxiv.org/pdf/2311.09735.

**[5.2] ⭐ Свіжість РЕАЛЬНА: AI-цитований контент на 25.7% свіжіший — АЛЕ перевага в ChatGPT/Perplexity, НЕ в Google AIO.** AI-цитовані URL: 1 064 дні vs 1 432 органіка; ChatGPT 958 днів; **Google AIO = 1 432 дні (ідентично органіці)**. Ahrefs, 17 млн цитувань, https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content (2025-07, **T2**). *Перевірено в першоджерелі 2026-06-15.* → **ПІДТВЕРДЖУЄ + РОЗШИРЮЄ (критичне уточнення)**. Значення: свіжість-перевага OverGarden структурна, але працює слабше саме на тій поверхні (Google AIO), що домінує в UA-ринку [1.2]. Виграш свіжості — переважно в ChatGPT/Perplexity.

**[5.3] ⭐ КОНТР-ДОКАЗ (найсильніший): AI-видимість корелює з наявною брендовою помітністю, не з «first-hand-ністю» сторінки.** Spearman із AIO-видимістю: брендові згадки 0.664, брендові анкори 0.527, брендовий пошук 0.392, DR 0.326, беклінки лише 0.218. Топ-квартиль згадок: 169 AIO-згадок vs 14 у наступного (>10×); нижні 50% «essentially invisible». Ahrefs, 75K брендів, https://ahrefs.com/blog/ai-overview-brand-correlation/ (2025-05-26, **T2**). → **СУПЕРЕЧИТЬ** сильній формі тези. Значення: якість proof-data може бути *необхідною, але не достатньою*; DR=0 сайт стартує в «невидимій» зоні незалежно від якості даних. Це центральний ризик (зв'язок із темою 6).

**[5.4] КОНТР-ДОКАЗ: AI цитує те, що вже ранжується.** ~40.6% AIO-цитувань — з топ-10 органіки; ~76% AI-цитованих сторінок уже в топ-10; держ-джерела ×11.75 базлайну; DR 88–100 ~6 000 сер. цитувань vs DR<63 «barely cited». Passionfruit, https://www.getpassionfruit.com/blog/why-ai-citations-lean-on-the-top-10 (2025-11-16, **T3**, агрегує Ahrefs-дослідження). Нюанс: 28% найцитованіших ChatGPT-сторінок мають 0 органіки Google — двері не зачинені повністю. → **СУПЕРЕЧИТЬ (зі змішаним нюансом)**. «Good SEO is good GEO» (Illyes/Sullivan).

**[5.5] ПІДТРИМКА тези: Reddit/спільнотний first-hand цитується найбільше.** Reddit — найцитованіший домен у ChatGPT/AI Mode/Gemini/Perplexity/AIO (Peec AI, 30 млн джерел), механізм — «authority + authentic user input». SEL https://searchengineland.com/ai-search-engines-cite-reddit-youtube-and-linkedin-most-study-473138 (2026-03-31, **T2**). → **ПІДТВЕРДЖУЄ**. Застереження: дом-ція Reddit частково = угода ліцензування + DA, не чисто first-hand-ність (конфаунд).

**[5.6] ⚠ ПРЯМИЙ КОНФЛІКТ у літературі: «brand-controlled sources, NOT Reddit».** Yext (6.8 млн цитувань) + SEL 10.2025 («AI search relies on brand-controlled sources, not Reddit»); частка Reddit нестабільна (ChatGPT ~60% → ~10% за 6 тижнів, Semrush). https://searchengineland.com/ai-search-citations-brand-controlled-sources-463166 (**T2/T3**). → **СУПЕРЕЧИТЬ/розмиває** [5.5]. Значення: не припускати «UGC/first-hand = автоматичне цитування»; доказ реально оспорюваний і платформо-/запит-залежний.

**[5.7] ПІДТРИМКА: Google Information Gain patent — новизна як фактор для AI-асистентів.** Патент (06.2022) на «information gain score» у контексті ранжування для natural-language-асистента; новий внесок цитується, перефраз «absorbed without attribution». SEJ https://www.searchenginejournal.com/googles-information-gain-patent-for-ranking-web-pages/524464/ (**T3** інтерпретація T1-патенту). → **ПІДТВЕРДЖУЄ (концептуально)**. Застереження: патент ≠ підтверджений прод-фактор.

**[5.8] ПІДТРИМКА (слабша провенансом): E-E-A-T «Experience» + вага авторських кредитів зростає.** Original research/first-hand = сильний E-E-A-T-сигнал; BrightEdge: вага авторських кредитів 8% (2024) → 16% (2025) — **НЕ ПІДТВЕРДЖЕНО** в першоджерелі. (**T3**). → **ПІДТВЕРДЖУЄ (директивно)**.

**Вердикт теми 5 (станом на 06.2026):** теза **ЗМІШАНО-ПОМІРНО підтверджена** — справедлива щодо свіжості й information-gain, але НЕ в сильній формі «движки віддають перевагу first-hand, тому новий автентичний майданчик будуть цитувати». Тримається: свіжість (найтвердіша опора, але слабша для Google AIO [5.2]); information-gain/новизна (концепт + GEO-стаття, але числа stale/патент не підтверджений-живим); експериментальний UGC справді нагорі цитувань (але конфаундовано Reddit-авторитетом). НЕ тримається: домінантний висновок 2025–26 — цитування йде за наявним брендовим авторитетом/згадками/топ-10, яких DR=0 не має. Усе сучасне — кореляційне; єдине причинне (Princeton) — stale. **Рамкувати тезу як «перевага свіжості + information-gain, ЗА УМОВИ досягнення базової AI-видимості/авторитету», а не «не-синтезовані дані будуть віддані автоматично».**

---

## ТЕМА 6 — Два сценарії: NEW (cold-start) і EXISTING (захист)

### 6А. NEW — cold-start AI-видимість + встановлення сутності

**[6.1] КОНТР-ДОКАЗ: цитування сильно сконцентроване; новий сайт «effectively shut out» на конкурентних/head-запитах.** Топ-10 доменів = 46% цитувань (product-comparison); топ-30 = 67%; ChatGPT діставав ~6× сторінок, ніж цитував (85% дістаних — ніколи не цитовані). Kevin Indig через SEL https://searchengineland.com/chatgpt-citations-domains-study-472349 (2026-03-24, **T2**, ~98K цитувань/1.2M відповідей). → **СУПЕРЕЧИТЬ** «опублікуй і будуть цитувати».

**[6.2] Відкриті двері — long-tail «no-clean-answer»: новий 0-беклінк домен може взяти перше цитування за ~2–6 тижнів, retrieval на рівні пасажу, не домену.** Scalemee/RankSwift https://www.scalemee.com/blog/how-to-get-cited-by-chatgpt-new-website-no-backlinks (2026-05, **T3**, sub-студії неперевірені). → **РОЗШИРЮЄ (директивно)**. Значення: структурна можливість OverGarden = long-tail сорт×регіон / «коли садити X у [регіон]» / шкідник-за-локацією, де медіа/ритейл не відповіли специфічно. Валідувати живими тестами.

**[6.3] Brand search volume — найсильніший предиктор LLM-цитувань (r≈0.334); беклінки слабкі. Згадка на 4+ платформах → ×2.8 у ChatGPT.** The Digital Bloom, «2025 AI Citation Report» https://thedigitalbloom.com/learn/2025-ai-citation-llm-visibility-report/ (2025-12, **T2**, синтез Princeton/Seer/680M). → **ПІДТВЕРДЖУЄ** [5.3]. Значення: важіль — брендові згадки в спільнотах/соц, не лінк-білдинг; але брендовий пошук у нішевому UA/BG-садівництві крихітний → повільно рухається.

**[6.4] Knowledge Panel створюється алгоритмом «when there is enough information on the open web» — його НЕ можна зробити, лише claim.** Google https://support.google.com/knowledgepanel/answer/9787176 (**T1**). → **РОЗШИРЮЄ**. Значення: Knowledge Panel — *лагуючий* індикатор, не важіль дня 1.

**[6.5] Wikidata-айтем створюється майже з нуля (поріг нотабельності низький; потрібне ≥1 джерело-референс) і є #1 фідом Google Knowledge Graph.** Wikidata:Notability https://www.wikidata.org/wiki/Wikidata:Notability (**T1**); KG-фід — Digital Bloom (**T2**). → **РОЗШИРЮЄ**. Значення: Wikidata-айтем + Organization-schema з `sameAs` → Wikidata/усі профілі = найдешевший entity-важіль, повністю під контролем, без авторитету. Парувати з мінімальним стороннім висвітленням (інакше можуть видалити).

**[6.6] Реалістичні строки: ~тижні до перших live-retrieval-цитувань на long-tail (за умови schema + answer-first + індексації в Bing, бо ChatGPT browse = Bing); parametric/«ChatGPT знає бренд» — місяці-роки.** Scalemee (**T3**) + травневий бенчмарк «50% сторінок — перше цитування за 7 днів, 90% за 37» (**T2/T3**). → **РОЗШИРЮЄ**. Значення: сабміт sitemap у Bing Webmaster Tools — конкретна передумова.

### 6Б. EXISTING — захист/ретрофіт уже здобутих цитувань

**[6.7] «Citation decay» реальний і швидкий: падіння за 4–6 тижнів без свіжого контенту (конкурентні ніші), 2–3 міс. у низькоконкурентних; Perplexity розпадається найшвидше.** Machine Relations/AuthorityTech https://machinerelations.ai/research/ai-citation-decay-how-brands-lose-visibility-over-time (2026-05-14, **T2**, arXiv-референси). → **РОЗШИРЮЄ**. Значення: безперервний UGC-журнал = вбудований анти-decay-двигун, ЯКЩО записи течуть; низькоконкурентна ніша = повільніший розпад; ризик — кілька журналів несуть усі цитування (крихкість).

**[6.8] Citation drift високий: ~70% AI-цитованих доменів змінюються за 6 міс.; місячний дрейф ~55% (AIO 59.3%/ChatGPT 54.1%).** Machine Relations (**T2**) + Digital Bloom (**T2**). → **РОЗШИРЮЄ**. Значення: жодне цитування — не довговічний актив; «захист» = підтримка швидкості, не разовий фікс.

**[6.9] Плейбук захисту (5 важелів):** стала свіжість; крос-доменна корроборація (ті самі факти на own+earned+third-party); entity-чіткість (стабільні schema/профілі/назва); рефреш топ-сторінок (+ re-ping IndexNow); щотижневий моніторинг цитувань. Machine Relations (**T2**). → **РОЗШИРЮЄ**. Значення: ретрофіт = schema+answer-капсули по беклогу + свіжий entity-шар + IndexNow.

**[6.10] Single-source dependency + тонкі entity-сигнали — головні прискорювачі розпаду; крос-доменна корроборація = сигнал надійності для retrieval.** Machine Relations (**T2**). → **РОЗШИРЮЄ**. Значення: якщо 3 журнали несуть видимість — ти крихкий; розподіляй цитований доказ по багатьох записах + корроборуй поза сайтом.

**[6.11] SOP моніторингу (безкоштовний, локаль-агностичний): 20–50 ядрових запитів → щотижня в ≥2 движках → частота цитувань (3 поспіль спади = decay) → лог хто витіснив → крос-движкова дивергенція → аудит свіжості (>90 днів = ризик).** Machine Relations (**T2**). → **РОЗШИРЮЄ**. Значення: працює ідеально для UA/BG, бо запити пишеш сам українською/болгарською.

---

## ТЕМА 7 — Вимірювання (хто реально працює для малого UA/BG-проєкту)

**[7.1] ⭐ Структурне застереження (несуче): «Your AI Visibility Strategy Doesn't Work Outside English».** Інструменти/бенчмарки >75% англо-first; embedding-моделі не мовно-нейтральні (Llama 3.1 ~8% не-англ. токенів) → «quietly degraded retrieval — дашборди лишаються зеленими». Аудит per-language запитами носіїв. Duane Forrester (ex-Bing), https://duaneforresterdecodes.substack.com/p/your-ai-visibility-strategy-doesnt (2026-04-12, **T2**). → **СУПЕРЕЧИТЬ** «купи інструмент і міряй». Значення: «бал» будь-якого інструменту для UA/BG може міряти не те; ручний метод носіями — не бюджетний фолбек, а найдостовірніший вимір. (Згадано: Україна анонсувала нац. LLM з Київстаром, 12.2025.)

**[7.2] Otterly — найдешевший, але контр-доказ: «optimized for English/US; multilingual hits walls».** Citeme https://www.citeme.io/ressources/otterly-ai-vs-peec-ai-... (2026, **T2/T3**) — конфлікт із власним «50+ країн» Otterly (**T1** pricing). → **СУПЕРЕЧИТЬ**. Значення: найдешевший може бути найгіршим для UA/BG; «50+ країн» = гео запиту, не якість кириличного трекінгу.

**[7.3] Peec AI — найімовірніший платний для UA/BG: мови/країни НЕ додають вартості (ціна лише за промпти).** Backlinko/workduo-рев'ю (2026-02, **T2**); звірити на peec.ai/pricing. → **РОЗШИРЮЄ**. Значення: ~€89/міс за 25 промптів, безлім країн/мов — але 25 промптів = ~12 UA + 12 BG; тріалити саме укр./болг. запитами.

**[7.4] Безкоштовні тіри, що реально працюють для DR=0: Knowatoa (free, 10 питань, ChatGPT) і Gumshoe.ai (free, 3 звіти).** Backlinko (2026-02, **T2**). → **РОЗШИРЮЄ**. Значення: почати з free + ручний метод до будь-яких платежів.

### Таблиця інструментів (звірені сигнали; «НЕ ПІДТВ.» = не підтверджено в першоджерелі)
| Інструмент | Що трекає | UA/BG? | Fit для малої ніші | Ціна-сигнал | Джерело (тір) |
|---|---|---|---|---|---|
| **Ручний метод носіями** | свої промпти → ChatGPT/Perplexity/Gemini (інкогніто) 3× → лог відповідей+цитованих URL | **найкращий** (пишеш UA/BG сам) | **найкращий** | ~free (платні сіти + час) | Forrester (T2) |
| **Knowatoa** | бренд/sentiment/конкуренти, 6 движків, історія | НЕ ПІДТВ. | **добрий** (free-тір) | Free (10 Q, ChatGPT); Starter $59/міс | синтез (T2) |
| **Gumshoe.ai** | persona-промпти, видимість по LLM | НЕ ПІДТВ. | **добрий** (free+pay-as-go) | Free (3 звіти); $0.10/run | Backlinko (T2) |
| **Peec AI** | видимість%/позиція/sentiment/джерела | **«будь-яка країна/мова без доплати»** — звірити | добрий (25 промптів Starter) | €89 / €199 / €499 | Backlinko (T2) |
| **ZipTie.dev** | присутність+цитування (ChatGPT/Perplexity/AIO) | НЕ ПІДТВ. | **добрий для соло** | $69 / $99 / $159 | Backlinko (T2) |
| **Semrush AI Toolkit** | SOV/sentiment/джерела, 7 движків | 8 регіонів; UA/BG НЕ ПІДТВ. | середній | $99/міс/домен + | Backlinko (T2) |
| **Otterly** | видимість/цитування/GEO-аудит | «50+ країн», але слабкий не-англ. (конфлікт) | дешевий вхід, **слабкий UA/BG** | $29 / $189 / $489 | otterly (T1) + Citeme (T2) |
| **Ahrefs Brand Radar** | 6 AI-платформ + YT/TikTok/Reddit | мульти; UA/BG НЕ ПІДТВ. (але UA трекається — див.[1.2]) | **дорого/надмірно** | ~$828–1148/міс all-in | рев'ю (T2) |
| **Profound** | answer-engine insights, SOV, crawl-логи | мульти, але **enterprise** | **поганий для малих** | $99 (ChatGPT-only) → $2000+ | Backlinko (T2) |
| **Goodie / Scrunch** | видимість/sentiment, 11+ моделей | НЕ ПІДТВ. | **поганий** (demo-gated/дорого) | ~$495/міс+ / ~$300+ | синтез (T2/T3) |

**Підсумок теми 7:** платні інструменти збудовані для великих англо-брендів. Найдешевший (Otterly) — найслабший не-англ. Найімовірніший платний — **Peec AI** (без мовної доплати), але не доведений на кирилиці — тріалити спершу. Уникати Profound/Goodie/Ahrefs Brand Radar/Scrunch (enterprise-ціни). **Старт — free + ручний метод носіями** (найдешевший І найдостовірніший для UA/BG).

---

## КОНФЛІКТИ ДЖЕРЕЛ (обидві сторони, без мовчазного усереднення)

1. **AIO в UA/BG: офіційно живий (T1) vs «засега основно на английски» (xseobg.com, T3, 2025-10-12).** Вага — офіційний список Google [1.1]/[1.2]; T3-блог писаний під час staged-розгортання. Обидві позначені.
2. **Reddit домінує в AI-цитуванні [5.5] vs «brand-controlled, not Reddit» [5.6].** Великі дослідження з обох боків; частка Reddit нестабільна (60%→10% за 6 тижнів). Методологія (промпти/вертикалі) керує розбіжністю. Не усереднювати — обидва живі.
3. **Schema піднімає AI-видимість (вендори/baseline «65%») vs нуль приросту в контрольованому тесті [3.1]/[3.2].** Примирення: schema = кореляція приналежності до пулу + допомога розумінню (Bing/index-time), але НЕ доведений приріст частоти цитування; чат-боти не читають JSON-LD при live-fetch.
4. **«AI цитує свіже» [5.2] vs «AI цитує топ-10/авторитет» [5.4].** Обидва справедливі на різних осях; Google AIO сам НЕ свіжо-упереджений (=органіка) — свіжість працює в ChatGPT/Perplexity.
5. **Cold-start: «2–6 тижнів» оптимізм (T3) vs концентрація/«shut out» (T2 Kevin Indig).** Сильніша сторона — T2. Нетто: новий сайт МОЖЕ взяти long-tail, але тижне-лічбу трактувати як маркетинг.

---

## ПРОГАЛИНИ (явний список — те, на що немає твердого джерела)

1. **Немає UA/BG-специфічного дослідження композиції AIO/цитувань.** Флагманське (Profound, [1.4]) — 10 мов, жодної кириличної. Найкращий крок: власна вибірка через Ahrefs Brand Radar (UA трекається), для BG — ручний SERP-семплінг.
2. **Немає верифікованого % покриття AIO для Болгарії** (13.14% спростовано [1.10]; межа — нижче 8.7%). Звірити платним пулом google.bg у SE Ranking/Semrush.
3. **Немає даних, чи UA/BG AIO цитують локальні vs англ. джерела в садівництві.** Лише директивна евристика [1.9]. Крок: 30–50 укр.+болг. садових long-tail-запитів, лог мови цитованих доменів.
4. **«Кириличний Reddit-вакуум» не виміряний** — гіпотеза за аналогією [1.4]. Перевірити: чи bg-mamma/UA-форуми вже спливають як цитовані домени.
5. **Жоден контрольований тест не ізолює ефект окремого ТИПУ схеми на AI-цитування** [3.1 — міряв присутність]. Найдешевший тест: 20–30 species/регіон-запитів у Perplexity/AIO, лог цитованих доменів.
6. **Немає species-query-специфічних даних SOV** (чи AIO/Perplexity цитують iNaturalist vs Wikipedia для «що це за рослина / X інвазивний у [регіон]»). Прямий емпіричний зонд дешевий і вирішальний.
7. **Точні per-method числа Princeton** не верифіковані (вторинні конфліктують) — відкрити PDF Table-2.
8. **Перенос на нішу/мову:** усі дані про вплив блокування краулерів і про цитування — з новинних/англ. сайтів; перенос на нішевий садовий UA/BG-UGC не доведений.
9. **Файли robots.txt Reddit/Wikipedia/Quora/StackOverflow** не звірені в цій сесії — перечитати браузером для точних токенів.
10. **Реальний кириличний трекінг Peec/Otterly/Semrush** — лише вендорські заяви, не тестовані на UA/BG; обов'язковий тріал.

---

## КРОС-АНАЛІЗ vs BASELINE (підсумок)
| Baseline-теза (UA-19/BG-19) | Дельта | Тег |
|---|---|---|
| AIO ~30–50% на UA-садівництві | UA всі-запити = 15.5% (T2, перевірено); садівництво плавдоподібно вище, але переміряти | **СУПЕРЕЧИТЬ** |
| JSON-LD / schema піднімає AI-цитування | Нуль приросту в контрольованому тесті; чат-боти не читають JSON-LD при live-fetch | **СУПЕРЕЧИТЬ** |
| Schema-пріоритети (Discussion/Profile/Taxon) | Виправдані rich-result+entity-гігієною, НЕ AI-цитуванням | **РОЗШИРЮЄ/СУПЕРЕЧИТЬ** |
| Reddit домінує (перенесеться на нас) | Імовірно інвертується в кирилиці → вакуум-можливість; але Reddit-домінація сама оспорювана | **РОЗШИРЮЄ + конфлікт** |
| iNaturalist 5–6× форуму = модель AI-джерела | iNaturalist масштабується як data/UGC-корпус, але AI його НЕ цитує; шлях — Wikidata | **СУПЕРЕЧИТЬ (для AI-citation-частини)** |
| +35% CTR цитованим / поз-1 −58% з AIO | Не верифіковано для UA/BG (усе US/англ.) | **ПРОГАЛИНА** |
| Свіжість як перевага | Реальна (T2), але слабша для Google AIO (=органіка); виграш у ChatGPT/Perplexity | **ПІДТВЕРДЖУЄ + уточнює** |
| proof-data = AI-стійкий moat | Концептуально так (information-gain/свіжість), але необхідна-не-достатня: цитування йде за авторитетом | **ПІДТВЕРДЖУЄ частково / СУПЕРЕЧИТЬ сильній формі** |

---

## ЧЕСНИЙ ВЕРДИКТ (truth over comfort)

**AI-канал для OverGarden реальний, але тонший і важчий, ніж припускав baseline — і два стовпи стратегії потребують перерамкування.**

- **Стовп «схеми для AI-цитування» — не витримує.** Обрані схеми лишаються правильними для Google rich results + entity-гігієни, але це НЕ важелі AI-цитування (контрольований доказ [3.1]/[3.2]). Якщо в дорожній карті є рядок «робимо schema, щоб нас цитував AI» — його треба переписати на «робимо `Organization+Person @graph/sameAs` + Wikidata для впізнавання сутності» [3.7]/[6.5].
- **Стовп «proof-data = moat проти AI» — справедливий, але умовний.** Свіжість і information-gain реальні [5.1]/[5.2]/[5.7], і структурно ваші. Але домінантний доказ 2025–26: AI цитує за наявним авторитетом/згадками/топ-10 [5.3]/[5.4], яких DR=0 не має. Якість даних — *необхідна, не достатня*. Зв'язуюче обмеження — не якість журналів, а встановлення сутності + базова видимість (тема 6).
- **Реальна асиметрична можливість:** long-tail сорт×регіон у Google AIO (вертикаль #2 за AIO-насиченістю [1.5]/[1.6]) + ймовірний «кириличний Reddit-вакуум» [1.4]. Downside малий (тижні тесту), upside — вільний слот цитування. Але це гіпотези — їх вирішує дешевий первинний зонд (прогалини 3, 5, 6), не презентація.
- **Болгарія — окрема, слабша задача.** Матеріально позаду України за AIO [1.2]; трактувати UA і BG як два різні проєкти оптимізації, не один.
- **Архітектура public/private — технічно здорова**, але приватне гео мусить бути за автентифікацією (robots.txt не захищає від ChatGPT-User/Perplexity-User/Bytespider [2.9]); і не блокувати Googlebot/Google-Extended наосліп [2.4].

**Найдешевший наступний крок із найбільшою цінністю:** первинний зонд — 30–50 укр. + 30–50 болг. long-tail садових запитів у Google AIO + Perplexity + ChatGPT, лог (а) чи генерується відповідь, (б) які домени/мови цитуються, (в) чи спливають bg-mamma/UA-форуми. Це за ~2 ручні години закриває одразу прогалини 1, 3, 4, 6 і замінює припущення реальними даними вашого ринку.
