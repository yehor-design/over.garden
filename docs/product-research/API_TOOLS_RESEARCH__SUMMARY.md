> # 📚 СТАТУС 2026-09-04 · `ДОКАЗ`
>
> Ця тека — дослідження, написане **до** початку розробки в коді. Джерело істини про
> продукт — репозиторій. Канон: `PRODUCT_CANON_2026-09.md` · заміщення:
> `SUPERSEDED_DECISIONS_LEDGER.md` · статуси всіх файлів: `RESEARCH_STATUS_INDEX.md`.
> Звірено з `over.garden` @ `main` `ab52664`, 2026-09-04.
>
> Рекомендований стек реалізовано частково: без Splink і string_grouper.

---

# OverGarden — Підсумок дослідження інструментів «двигуна зведення» (_SUMMARY)

**Що це:** зведення оркестратора по 9 задачах інструментів (A, B1–B5, C1, C2, D1): найкращий вибір на кожну задачу (free / paid / під-наші-обмеження), рекомендований повний стек, відкриті питання й чесно названі прогалини. Зведено з `raw/*` (discovery) + `evaluation/*` (оцінка 9 саб-агентів), верифіковано проти першоджерел.
**Дата:** 2026-06-06. **Статус:** повний; прогалини (B3 фонетика UA/BG, B4 клавіатура BG, B2 стандарт-конформність, C2 крос-мовний матч) названі явно.
**Наскрізна верифікація:** спот-перевірено проти першоджерел — Splink = **MIT**, AnyAscii = **ISC**, nlpaug `uk.json` = реальна UA ЙЦУКЕН-мапа (містить `і`); ліцензії incumbents (Meilisearch/cyrtranslit/RapidFuzz MIT; Typesense/abydos GPLv3; ICU permissive) підтверджені раніше.

> **Дисципліна:** «технічно підходить» ≠ «ліцензійно дозволено в закритому комерційному продукті». Permissive (MIT/Apache/BSD/ISC/PostgreSQL/ICU/Unicode) — зелено; копілефт (GPL/LGPL/AGPL/SSPL/BUSL/ELv2) — прапор. UA ≠ RU ≠ BG.

---

## Рекомендація по кожній задачі (free / paid / під-наші-обмеження + проти incumbent)

### Задача A — Пошуковий рушій (typeahead + typo-tolerance + кирилична токенізація + ранжування)
- **Найкращий free / під наші обмеження:** **Meilisearch self-host** (MIT-ядро; Charabia дослівно «Cyrillic (Russian, Ukrainian, Bulgarian, etc.) — Decomposition, lowercase»; typo-tolerance з коробки; найнижчі ops-витрати).
- **Найкращий paid:** **Meilisearch Cloud** (та сама кирилиця) або **Algolia** (із застереженням: транслітерація лише японська → крос-скрипт не закриває).
- **Incumbent: Meilisearch → KEEP.** Єдиний мейнстрім-рушій, що поєднує permissive MIT + підтверджені uk+ru+bg + низькі витрати. Доповнити лише за потреби глибшої морфології: **Manticore** (ru/uk лематизація — АЛЕ GPLv3, прапор) або **PostgreSQL + pg_trgm** (permissive, для внутрішньої аналітики/дедупу).
- **Прапори:** Typesense (GPL-3.0), Manticore (GPLv3), ParadeDB (AGPLv3), Sphinx (GPLv2), Elasticsearch (ELv2/SSPL), RediSearch (RSALv2/SSPL/AGPL) — копілефт/обмежені, уникати у закритому продукті. **Прогалина:** жоден рушій не робить крос-скрипт Cyrillic↔Latin у движку — це окремий крок (B2).

### Задача B1 — Нормалізація тексту
- **Найкращий free / під наші обмеження / incumbent: ICU / PyICU → KEEP** (NFC/NFKC + однопрохідний `nfkc_cf` case-fold + UTS#39 `uspoof` confusables; усе permissive, підтримує Консорціум).
- **Доповнити:** **AnyAscii (ISC)** — permissive ASCII-форма (заміна GPL `unidecode`); **ftfy** (Apache) + **charset-normalizer** (MIT) на вході; для homoglyph — ICU `uspoof` або `confusable_homoglyphs` (MIT).
- **Paid:** практично відсутній (нормалізація — комодитизований примітив; платне з'являється лише в MDM/дедуп-сюїтах = задача D1). Чесно зафіксовано.
- **Прогалина:** жоден інструмент не складає uk/ru/bg-специфічні літери (ё≡е, и/і, ъ/ь, варіанти апострофа) — Unicode тримає їх окремими навмисно → потрібна крихітна власна мапа.

### Задача B2 — Транслітерація
- **Найкращий free / incumbent: cyrtranslit → KEEP** (MIT, усі 3 мови, двонапрямна) — **але вихід ISO-9-родини, НЕ стандарт-конформний** (перевірено: UA `Pid ležačyj kamin'` ≠ КМУ-2010; BG `Săedinenieto` ≠ BG-2009 «Saedinenieto»). Не вважати її ключі офіційними.
- **Доповнити (per-locale офіційні стандарти, усі MIT):** **translit-ua** (КМУ-2010 для UA + ICAO/GOST для RU); **translitbg** (єдина перевірена реалізація BG-2009 — АЛЕ Go/JS, не Python → рішення «портувати чи сервіс»); **iuliia** (RU, ending-aware GOST/ICAO). **anyascii (ISC)** як permissive ASCII-fallback замість GPL `unidecode`.
- **Paid:** по суті відсутній (Google/Azure — input-method, хмарозалежні, не стандарт).
- **Прапори:** transliterate/barseghyanartur (GPL-2.0/LGPL-2.1), unidecode (GPL-2.0+), polyglot (GPLv3), Lingua::Translit (Artistic/GPL).
- **Прогалини:** жодна одна бібліотека не робить усі 3 в офіційному стандарті; **BG-2009 у Python відсутній**; офіційні стандарти лосі/незворотні → для спільного ключа брати одно-напрямну романізацію, не round-trip.

### Задача B3 — Фонетичне зіставлення (кирилиця)  ⚠ ПРОГАЛИНА
- **Incumbent: НЕМАЄ.** Шлях — гібрид, не одна бібліотека:
  - **ru — закрито (permissive):** **fonetika / roddar92/russian_soundex** (MIT, Soundex/Metaphone прямо на кирилиці + distance).
  - **uk — тонко:** будувати тонкий шар ключа/відстані поверх **epitran `ukr-Cyrl`** / **lang-uk/ipa-uk** / **ukrainian-tts-preprocessing** (усі MIT/Apache — лише G2P-примітиви, не готовий дедуп-ключ).
  - **bg — фактично порожньо:** немає permissive готового; ручна таблиця ~40–60 правил Cyrillic→фонема (болгарська орфографія високо фонематична) краща за GPL espeak-ng.
- **Уникати:** abydos (GPL-3.0), espeak-ng bg (GPL-3.0), Beider-Morse (**не має UA й BG** — заточений під ашкеназькі прізвища). PostgreSQL `fuzzystrmatch` фонетика зламана на UTF-8/кирилиці (за докою PG).
- **Чесна прогалина:** 0 зрілих uk фонетичних дедуп-бібліотек; bg — прогалина (0 permissive). Paid — близько до нуля для uk/bg.

### Задача B4 — Клавіатурні помилки (uk/ru/bg розкладки)  ⚠ ПРОГАЛИНА
- **Incumbent: НЕМАЄ.** Шлях:
  - **uk — дані Є:** **nlpaug `uk.json`** — справжня UA ЙЦУКЕН-сусідня мапа (MIT; підтверджено — містить `і`).
  - **ru — дані Є:** **multypo** має вбудовану RU ЙЦУКЕН-розкладку (MIT).
  - **bg — нічого не постачається:** **обов'язково будувати** `bg_bds.json` (БДС 5237-78) і `bg_phonetic.json` з **kbdlayout.info** (`KBDBU`/`KBDBGPH`) або CLDR — БДС не має QWERTY-відповідності, потрібна позиційна таблиця.
  - **Двигун:** **multypo** (replace/insert/delete/transpose + runtime `register_keyboard_layout`); вендорити/форкнути (pre-1.0, v0.1.1).
- **Усе MIT/Unicode-permissive; копілефту й платних варіантів немає.**
- **Чесна прогалина:** жоден інструмент не покриває uk+ru+bg(БДС)+bg(Phonetic); жоден не постачає bg-даних → будувати 2 BG-мапи + glue. (Застереження: `availableLanguages` на PyPI-сторінках typo/multypo — це UI-селектор сайту, НЕ покриття бібліотеки.)

### Задача B5 — Генерація варіантів назви
- **Incumbent: НЕМАЄ.** Рекомендована збірка (оркеструвати примітиви B2+B3+B4 + фільтр C1):
  - **multypo** (клавіатура) + **cyrtranslit/translit-ua** (транслітерація) + **homoglyphs/life4** (MIT, візуальні) + permissive фонетичний кодувальник + **self-hosted constrained LLM** (llama.cpp GBNF / Outlines-Apache / Guidance-MIT) → усе фільтрується схожістю **RapidFuzz**.
  - Шаблон процесу: **RuTransform** (Apache-2.0) — perturb→BERTScore→залишити-найсхожіші (і прямо для RU).
- **Уникати:** abydos (GPL-3.0). **Paid:** мізерний/не по темі (Gretel/Tonic = загальні синтетичні дані; єдиний практичний платний шлях — hosted LLM + JSON-mode).
- **Прогалина:** RU добре забезпечений; **UA** — немає готового генератора (лише розширення); **BG** — найтонше. Must-build: UA-ЙЦУКЕН + BG-БДС/phonetic мапи (той самий відсутній актив, що B4) + non-GPL слов'янський фонетичний кодувальник.

### Задача C1 — Схожість рядків
- **Найкращий free / під наші обмеження / incumbent: RapidFuzz → KEEP** (MIT, C++ швидкість, Unicode-коректний по code-points, без ASCII-fold з v3.0.0, `cdist` one-to-many).
- **Доповнити:** **jellyfish** (MIT — незалежні Jaro-Winkler/Damerau для ensemble/крос-чек); **textdistance** (MIT — буфет метрик для офлайн-тюнингу порогів на реальних кириличних парах); **py_stringmatching** (BSD — token-set/Monge-Elkan/soft-TF-IDF для багатослівних назв). **PolyFuzz** (MIT) для дедуп-кластеризації.
- **Замінити:** GPL `python-Levenshtein`/`Levenshtein`/`fuzzywuzzy`/`thefuzz` → на RapidFuzz. **Paid:** по суті відсутній (Senzing/Zingg — це ER/MDM, не скорери C1).
- **Прогалина:** кирилична коректність оцінена з докі/коду на рівні архітектури, не виконанням — рекомендований 10-рядковий емпіричний тест на реальних uk/ru/bg парах для фіналістів.

### Задача C2 — Крос-мовний матч імен  ⚠ ПРОГАЛИНА (build-vs-buy)
- **Incumbent: НЕМАЄ.** Рекомендація — **ЗІБРАТИ OSS (не купувати поки, не відкладати):**
  - **multilingual-e5 (MIT) / LaBSE (Apache-2.0) + FAISS (MIT) / Annoy (Apache)** — ембединги для крос-скрипт-ідентичності «як цілого»;
  - **rigour + nomenklatura/yente (MIT)** + **cyrtranslit** — нормалізація/транслітерація/канонічний ID;
  - + **C1**-схожість як гейт.
- **Найкращий paid:** **Babel Street/Rosette RNI-RNT** (лідер для кирилиці), **Senzing** (self-host, безкоштовний eval), IBM GNM / NetOwl / SAS QKB (усі «contact sales»).
- **Уникати:** abydos (GPL-3.0), Unidecode (GPL-2.0+).
- **Прогалина:** **жоден інструмент — free чи paid — публічно не підтверджено, що трактує UA vs RU vs BG як три окремі системи** на рівні матчингу; BG найменш забезпечений; ембединги **не перевірені на голих коротких власних назвах** → потрібен бенчмарк/донавчання перед ставкою.

### Задача D1 — Дедуп / зв'язування записів
- **Найкращий free / під наші обмеження / incumbent: Splink → KEEP** (MIT — підтверджено дослівно; Fellegi-Sunter; DuckDB/Spark/Postgres; Jaro-Winkler/Levenshtein похідні від RapidFuzz, працюють по Unicode code-points, не байтах; доведено на нелатинському Lao-розгортанні).
- **Доповнити:** (1) **RapidFuzz** realtime-гейт match-at-type; (2) крок **транслітераційної нормалізації** (ICU/translit) перед матчингом; (3) **вимкнути фонетичні рівні** (англо/німецько-орієнтовані).
- **Найкращий paid:** **Tilores** (realtime/self-host, ~150ms) або **Senzing** (self-host, free eval); **Rosette/Babel Street** якщо кирилична точність стане критичною для бізнесу. AWS Entity Resolution ($0.25/1k) — без free tier.
- **Прапори:** Zingg (AGPL-3), thefuzz/FuzzyWuzzy (GPL-2), Neo4j Community (GPLv3), R-libs fastLink/RecordLinkage (GPL).
- **Прогалина:** жоден OSS не робить крос-скрипт нативно (лише Rosette-paid) → потрібен крок пре-нормалізації; UA≠RU≠BG моделюємо як поле/блокуючий ключ самі; емпірична точність на коротких кириличних назвах не підтверджена вендорами — потрібен власний бенчмарк.

---

## Рекомендований повний стек (переважно ПІДТВЕРДЖЕННЯ поточного + закриття прогалин)

- **Пошук/typeahead:** Meilisearch (MIT) — *тримати*.
- **Нормалізація:** ICU/PyICU (+ власна крихітна uk/ru/bg-fold мапа) — *тримати*.
- **Транслітерація:** cyrtranslit (зручний спільний ключ) + per-locale стандартні романізатори translit-ua / translitbg(порт) / iuliia + anyascii(ISC)-fallback — *тримати+розширити*.
- **Схожість:** RapidFuzz (MIT) — *тримати*; + jellyfish для ensemble.
- **Дедуп:** Splink (MIT) — *тримати*; + транслітераційна нормалізація + RapidFuzz-гейт; фонетичні рівні вимкнути.
- **Генерація варіантів (build):** multypo + транслітерація + homoglyphs + constrained LLM, фільтр RapidFuzz.
- **Фонетика (build):** fonetika (ru) + epitran/ipa-uk (uk) + ручні правила (bg).
- **Клавіатура (build):** nlpaug uk.json (uk) + multypo (ru) + власні БДС/Phonetic мапи (bg).
- **Крос-мовний матч імен (assemble/benchmark):** LaBSE/e5 + FAISS + транслітерація + схожість; бенчмарк перед зобов'язанням.

**Головна теза:** поточний стек (Meilisearch + ICU + cyrtranslit + RapidFuzz + Splink) — **правильний і весь permissive**; жоден альтернативний інструмент не змушує його замінити. Уся реальна робота — у **build-прогалинах для UA/BG**, а не в купівлі.

---

## Відкриті питання й прогалини (чесно)

1. **B3 фонетика UA/BG — найбільша прогалина.** 0 permissive готового для bg; uk лише примітиви → будувати самим. Не існує Beider-Morse для UA/BG.
2. **B4 клавіатура BG — дані не існують** у жодному інструменті → будувати БДС + Phonetic мапи з kbdlayout.info/CLDR.
3. **B5 генерація варіантів UA/BG** — збирати з примітивів; відсутні активи = саме BG-клавіатурні мапи + non-GPL слов'янський фонетичний кодувальник.
4. **B2 стандарт-конформність** — cyrtranslit не офіційний стандарт; BG-2009 у Python відсутній (портувати translitbg або прийняти ISO-9-ключ як суто внутрішній).
5. **C2 крос-мовний матч** — жоден інструмент не трактує UA≠RU≠BG окремо; ембединги не перевірені на коротких власних назвах → бенчмарк/донавчання.
6. **Наскрізні копілефт-пастки** (уникати в закритому продукті): Typesense GPLv3, Manticore GPLv3, ParadeDB AGPLv3, Elasticsearch SSPL/ELv2, abydos GPLv3, unidecode/python-Levenshtein/thefuzz GPL, Zingg AGPL — для кожного є визначена MIT/Apache/ISC/BSD-альтернатива (вище).
7. **Емпірика не виконувалася** (заборона виконання коду/завантажень у дослідженні) — кирилична точність оцінена з докі/коду; рекомендований власний міні-бенчмарк на реальних uk/ru/bg парах для фіналістів (C1/D1/C2).
8. **Методологічна нота пошуку:** WebSearch — переважно англомовний інтерфейс; запити містили кириличні терміни, але stand-alone uk/ru/bg-інтерфейсні сесії обмежені — можливий додатковий локальний прохід для нішевих UA/RU/BG-репозиторіїв.

**Узгодження з попереднім синтезом:** це підтверджує висновок `_SYNTHESIS/DECISION_BRIEF` — двигун L5/L6 будується з permissive OSS, а реальні прогалини — UA/BG фонетика, BG клавіатура й стандарт-конформна транслітерація (усе «build»).
