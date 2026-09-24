# A screen reader on the redesign: Orca on Chromium

One real screen-reader/browser pairing for `OVE-478` criteria 7 and 9,
recorded as it happened on 2026-09-24 against a local production build of
the tested tree: a guest reads the home page by its structure and changes
the language by landmark; an unknown answer's 404; the journals' filters
opened and closed; a gardener creates a plant while writing and cancels it,
picks one of three same-named tomatoes, finds Publish unavailable until the
first-publication box is ticked, loses the network at Publish and publishes
on retry; a Bulgarian entry in a Ukrainian interface; the gardener's
collection; the sign-out confirmation.

| | |
| --- | --- |
| Screen reader | Orca 46.1-1ubuntu1 (AT-SPI 2.52.0-1build1, speech-dispatcher 0.12.0~rc2-2build3, espeak-ng 1.51+dfsg-12build1) |
| Browser | Chromium 141.0.7390.37, headed, `--force-renderer-accessibility` |
| Display | Xvfb :99, 1280×900, Linux, no window manager |
| Server | `next start` of the tested tree, local data |

**How it was driven.** Every key is pressed through the X server with
`xdotool`, so Orca receives it as it would from a keyboard: its browse-mode
commands (H headings, K links, M landmarks, B buttons), Tab, Enter, Space,
arrows and Escape. Text is typed as text. Playwright is attached over the
DevTools protocol only to sign the gardener in, to set the saved interface
language between parts, to take the network away for one step, and to read
back what the page did (the "observed" lines). What
Orca said is copied from its own debug log (`SPEECH OUTPUT`), and the voice
language from its speech generator (`voice requested with language=…`).

**Settings.** Orca's defaults, except that reading the whole page on load
is off (Preferences → Web → "Automatically start speaking a page when it is
first loaded"), so a page announces its summary and the reader moves by
structure. One step is not the reader's own key: focus is put on the
account menu's button before Enter, as a click would put it. When the
composer moves focus into its field by script, Orca stays in browse mode,
where the arrows read the page rather than the list; the reader steps out
of the field and back in (Shift+Tab, Tab), which Orca follows into focus
mode. A focus on the document itself is observed with no name.

**Reading the log.** Orca writes a line to its log a moment after it
speaks it, so a step's last words sometimes appear under the next step:
the picker's highlighted options arrive one arrow late (the order is the
order heard), and the third heading of the collection under the step
after it. Nothing is reordered here.

**Not a VoiceOver or NVDA result.** No macOS or Windows machine was
available; those pairings remain unperformed (`ACCESSIBILITY_FIXTURES.md`).

## Transcript

### Guest opens the home page (uk)

Keys: `(load /)`

> Finished loading OverGarden.
> Page has 11 landmarks, 11 headings, 67 unvisited links.
> Перейти до основного вмісту link.

Voice: uk

Observed: `{"lang": "uk", "title": "OverGarden"}`

### Next heading ×3 (H)

Keys: `h h h`

> h
> Стрічка heading level 1.
> h
> Перші яйця від нових курей — журнал 4б - Кури link heading level 2.
> h
> Посадила малину біля паркану — журнал 4 - Малина link heading level 2.

Voice: uk

### Next link (K)

Keys: `k`

> k
> #Породи link.

Voice: uk

### Next landmark until the language navigation — m 1

Keys: `m`

> m
> Що показати
> Останні link.
> Підписки link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Останні"}`

### Next landmark until the language navigation — m 2

Keys: `m`

> m
> Сторінки стрічки
> До початку стрічки push button grayed.
> Наступна сторінка link.

Voice: uk

Observed: `{"tag": "body", "role": null, "name": null}`

### Next landmark until the language navigation — m 3

Keys: `m`

> m

Observed: `{"tag": "body", "role": null, "name": null}`

### Next landmark until the language navigation — m 4

Keys: `m`

> Публічний журнал садівництва: кожен запис відкритий і
> m
> Вибір мови інтерфейсу
> Змінити мову — Українська (UK) toggle button collapsed.
> UK.

Voice: uk

Observed: `{"tag": "summary", "role": null, "name": "Змінити мову — Українська (UK)"}`

### Open the language control (Enter)

Keys: `Return`

> return

Observed: `{"tag": "summary", "role": null, "name": "Змінити мову — Українська (UK)"}`

### Next option (Tab)

Keys: `Tab`

> expanded
> tab
> menu
> Українська selected radio menu item.
> Focus mode

Voice: uk

Observed: `{"tag": "a", "role": "menuitemradio", "name": "Українська"}`

### Next option (Tab)

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": "menuitemradio", "name": "Български"}`

### Choose it (Enter)

Keys: `Return`

> Български not selected radio menu item.
> return
> Browse mode
> Към основното съдържание link.

Voice: bg

Observed: `{"url": "http://localhost:3999/bg", "lang": "bg"}`

### An unknown answer (was a 500) — bg

Keys: `(load /bg/answers/ove478-no-such)`

> Finished loading Страницата не е намерена \| OverGarden.
> Page has 4 landmarks, 1 heading, 1 visited link.

Observed: `{"lang": "bg", "title": "Страницата не е намерена | OverGarden"}`

### Tab to the one way on

Keys: `Tab`

> banner OverGarden.
> tab
> main content
> Към OverGarden visited link.

Voice: bg

Observed: `{"tag": "a", "role": null, "name": "Към OverGarden"}`

### Tab again: the language control is next, nothing else

Keys: `Tab`

> tab
> leaving main content.
> information
> navigation Избор на език на интерфейса
> Смяна на езика: Български toggle button collapsed.
> Focus mode

Voice: bg

Observed: `{"tag": "summary", "role": null, "name": "Смяна на езика: Български"}`

### Guest opens the journals (uk)

Keys: `(load /journals)`

> 17 записів
> Browse mode
> Перейти до основного вмісту link.

Voice: uk

Observed: `{"lang": "uk", "title": "Журнали | OverGarden"}`

### To the filters — Tab 1

Keys: `Tab`

> tab

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Перейти до основного вмісту"}`

### To the filters — Tab 2

Keys: `Tab`

> Перейти до основного вмісту link.
> tab

Observed: `{"tag": "a", "role": null, "name": "OverGarden"}`

### To the filters — Tab 3

Keys: `Tab`

> banner
> OverGarden link.
> tab
> Пошук link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Пошук"}`

### To the filters — Tab 4

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": null, "name": "Стрічка"}`

### To the filters — Tab 5

Keys: `Tab`

> navigation Основна навігація
> List with 2 items.
> Стрічка link.
> tab
> Огляд link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Огляд"}`

### To the filters — Tab 6

Keys: `Tab`

> tab
> leaving list.
> leaving navigation.
> navigation Моє
> List with 2 items.
> Мій сад link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Мій сад"}`

### To the filters — Tab 7

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": null, "name": "Події"}`

### To the filters — Tab 8

Keys: `Tab`

> Події link.
> tab
> leaving list.
> leaving navigation.
> Новий запис link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Новий запис"}`

### To the filters — Tab 9

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": null, "name": "Увійти"}`

### To the filters — Tab 10

Keys: `Tab`

> Увійти link.
> tab

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Стрічка"}`

### To the filters — Tab 11

Keys: `Tab`

> leaving banner.
> navigation Стрічка
> Стрічка link.
> tab

Observed: `{"tag": "a", "role": null, "name": "Стрічка підписок"}`

### To the filters — Tab 12

Keys: `Tab`

> Стрічка підписок link.
> tab
> leaving navigation.
> main content
> Пошук у публічних журналах entry Проблема, догляд, об'єкт або ідентичність.
> Focus mode

Voice: uk

Observed: `{"tag": "input", "role": null, "name": ""}`

### To the filters — Tab 13

Keys: `Tab`

> tab
> Знайти push button.
> Browse mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Знайти"}`

### To the filters — Tab 14

Keys: `Tab`

> tab

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Усі об'єкти"}`

### To the filters — Tab 15

Keys: `Tab`

> navigation Що показати
> List with 3 items.
> Усі об'єкти link.
> tab

Observed: `{"tag": "a", "role": null, "name": "Рослини"}`

### To the filters — Tab 16

Keys: `Tab`

> Рослини link.
> tab

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Тварини"}`

### To the filters — Tab 17

Keys: `Tab`

> Тварини link.
> tab
> leaving list.
> leaving navigation.
> Фільтри collapsed push button.
> opens dialog
> Focus mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Фільтри"}`

### Open the filters (Enter)

Keys: `Return`

> return
> expanded
> Фільтри журналів
> Фільтри журналів
> Результати зміняться, коли ви натиснете «Показати результати». «Закрити» нічого не змінює.
> Результати зміняться, коли ви натиснете «Показати результати». «Закрити» нічого не змінює.
> Ідентичність
> Ідентичність
> Усі ідентичності
> Solanum lycopersicum L. (1)
> Де Барао (1)
> Тема або проблема
> Тема або проблема
> Усі теми
> Породи (14)
> Балконні томати (2)
> Види (2)
> Сорти рослин (1)
> Сезон
> Сезон
> Усі сезони
> Зима
> Весна
> Літо
> Осінь
> Безпечний регіон
> Безпечний регіон
> Усі публічні регіони
> Очистити фільтри
> Очистити фільтри
> Показати результати

Observed: `{"tag": "button", "role": null, "name": "Фільтри"}`

### Escape: the filters close

Keys: `Escape`

> escape

Observed: `{"tag": "button", "role": null, "name": "Фільтри"}`

### Gardener opens Write (uk): the picker has focus

Keys: `(load /garden/new)`

> collapsed
> Loading.  Please wait.
> Browse mode
> main content.
> main content
> Куди записати? editable combo box.
> Шукаємо…
> opens listbox
> Focus mode
> Шукаємо…
> expanded
> Шукаємо…

Voice: uk

Observed: `{"lang": "uk", "title": "Новий запис | OverGarden"}`

### Types a plant the gardener does not have

Keys: `(text) Малина`

> collapsed
> Шукаємо…
> Шукаємо…
> Нічого не знайдено. Спробуйте іншу назву.

### To «New plant or animal» — Tab 1

Keys: `Tab`

> Нічого не знайдено. Спробуйте іншу назву.
> tab
> Очистити пошук push button.
> Browse mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Очистити пошук"}`

### To «New plant or animal» — Tab 2

Keys: `Tab`

> tab
> Нова рослина чи тварина «Малина» push button.

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Нова рослина чи тварина «Малина»"}`

### Start it (Enter): the name field has focus

Keys: `Return`

> return
> Нова рослина чи тварина panel.
> Назва entry Малина.
> Focus mode

Voice: uk

Observed: `{"tag": "input", "role": null, "name": "", "value": "Малина"}`

### To «Choose an existing one» — Tab 1

Keys: `Tab`

> tab
> Це panel.
> Рослина.
> selected radio button
> Browse mode

Voice: uk

Observed: `{"tag": "input", "role": null, "name": ""}`

### To «Choose an existing one» — Tab 2

Keys: `Tab`

> tab
> leaving panel.
> Де вона panel.
> У моєму просторі.
> selected radio button

Voice: uk

Observed: `{"tag": "input", "role": null, "name": ""}`

### To «Choose an existing one» — Tab 3

Keys: `Tab`

> tab
> leaving panel.
> Знайти свій простір editable combo box.
> opens listbox
> Focus mode

Voice: uk

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### To «Choose an existing one» — Tab 4

Keys: `Tab`

> expanded
> tab
> Обрати наявну push button.
> Browse mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Обрати наявну"}`

### Choose an existing one (Enter): back to the picker

Keys: `Return`

> return
> expanded

Observed: `{"tag": "input", "role": "combobox", "name": "", "value": ""}`

### Out of the field and back in (Shift+Tab, Tab)

Keys: `shift+Tab Tab`

> left shift
> leaving main content.
> banner
> Акаунт collapsed push button.
> opens menu
> Focus mode
> tab
> leaving banner.
> main content
> Куди записати? editable combo box.
> opens listbox
> expanded
> expanded

Voice: uk

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### Types the plant's name

Keys: `(text) Томат`

> Шукаємо…
> Шукаємо…
> expanded

### Down: the first result

Keys: `Down`

> Томат черрі Рослина · Балкон.
> not selected.

Voice: uk

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### Down: the second

Keys: `Down`

> *(nothing spoken)*

Voice: uk

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### Down: the third

Keys: `Down`

> Томат черрі Рослина · Город.
> not selected.

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### Up ×2: to the one on the balcony

Keys: `Up Up`

> Томат черрі Рослина · Теплиця.
> not selected.
> Томат черрі Рослина · Город.
> not selected.

Voice: uk

Observed: `{"tag": "input", "role": "combobox", "name": ""}`

### Choose it (Enter): focus moves to the text

Keys: `Return`

> Томат черрі Рослина · Балкон.
> not selected.
> return
> Вміст запису entry.

Voice: uk

Observed: `{"tag": "div", "role": "textbox", "name": "Вміст запису"}`

### Writes the note

Keys: `(text) Перша зав'язь на нижній китиці.`

> *(nothing spoken)*

### To the first-publication box — Tab 1

Keys: `Tab`

> tab

Observed: `{"tag": "button", "role": null, "name": "Додати блок"}`

### To the first-publication box — Tab 2

Keys: `Tab`

> Додати блок collapsed push button.
> opens menu
> tab

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Перетягнути блок: Текст, 1 / 1"}`

### To the first-publication box — Tab 3

Keys: `Tab`

> Перетягнути блок: Текст, 1 / 1 collapsed push button.
> opens menu
> tab
> Інструменти запису panel.
> Фото push button.
> Browse mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Фото"}`

### To the first-publication box — Tab 4

Keys: `Tab`

> tab

Observed: `{"tag": "button", "role": null, "name": "Жирний"}`

### To the first-publication box — Tab 5

Keys: `Tab`

> Жирний toggle button not pressed.
> tab

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Курсив"}`

### To the first-publication box — Tab 6

Keys: `Tab`

> Курсив toggle button not pressed.
> tab

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Маркований список"}`

### To the first-publication box — Tab 7

Keys: `Tab`

> Маркований список toggle button not pressed.
> tab
> Блок collapsed push button.
> opens menu
> Focus mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Блок"}`

### To the first-publication box — Tab 8

Keys: `Tab`

> tab

Observed: `{"tag": "button", "role": null, "name": "Підказки та скорочення"}`

### To the first-publication box — Tab 9

Keys: `Tab`

> Підказки та скорочення collapsed push button.
> opens dialog
> tab

Voice: uk

Observed: `{"tag": "summary", "role": null, "name": "Більше деталей"}`

### To the first-publication box — Tab 10

Keys: `Tab`

> leaving panel.
> Більше деталей toggle button collapsed.
> tab
> Я розумію, що цей запис і вибрані фото одразу стануть публічними. check box not checked required.
> invalid entry.
> Browse mode

Voice: uk

Observed: `{"tag": "input", "role": null, "name": ""}`

### Next button (B): is Publish available

Keys: `b`

> b
> Опублікувати push button grayed clickable.

Voice: uk

Observed: `{"tag": "body", "role": null, "name": null}`

### Previous form field (Shift+F): back to the box

Keys: `shift+f`

> left shift
> F
> Я розумію, що цей запис і вибрані фото одразу стануть публічними. check box not checked required.
> invalid entry.

Voice: 

Observed: `{"tag": "input", "role": null, "name": ""}`

### Tick it (Space)

Keys: `space`

> space

Observed: `{"tag": "input", "role": null, "name": "", "checked": true, "reachedBoxByTab": true}`

### To Publish — Tab 1

Keys: `Tab`

> checked
> tab
> Що саме буде публічним link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Що саме буде публічним"}`

### To Publish — Tab 2

Keys: `Tab`

> tab
> Опублікувати push button clickable.

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Опублікувати"}`

### Publish (Enter) with the network gone

Keys: `Return`

> return
> Запис не опубліковано. Спробуйте опублікувати ще раз.

Observed: `{"tag": "button", "role": null, "name": "Опублікувати", "text": "Перша зав'язь на нижній китиці."}`

### Publish again (Enter), the network back

Keys: `Return`

> return
> Запис опубліковано.
> Історія об'єкта \| OverGarden

Observed: `{"url": "http://localhost:3999/garden/objects/031758d3-2a3f-4f64-8948-d075166d9d3d", "reachedPublish": true, "entries": 1}`

### A Bulgarian entry, read in a Ukrainian interface

Keys: `(load /@gardener_fa86ab69c74e41c2/post/2)`

> 0 вподобань
> Finished loading Първи цветове на балкона · Запис журналу \| OverGarden.
> Page has 12 landmarks, 3 headings, 20 unvisited links.
> Перейти до основного вмісту link.
> 0 вподобань

Voice: uk

Observed: `{"lang": "uk", "title": "Първи цветове на балкона · Запис журналу | OverGarden"}`

### To the entry's heading (H)

Keys: `h`

> h
> Първи цветове на балкона heading level 1.

Voice: bg

### Line by line (Down ×6)

Keys: `Down Down Down Down Down Down`

> Доматите цъфнаха след дъжда. Утре ще ги полея сутринта.
> region Про що цей запис
> Про що цей запис heading level 2.
> Description list with 1 term.
> Ідентичність description term.
> Ідентичність уточнюється description value.
> leaving list.
> Відкрити паспорт link.
> leaving region.
> Дії із записом panel.
> Подобається, 0 вподобань toggle button not pressed.

Voice: bg → uk → 

### Gardener opens My garden (uk)

Keys: `(load /garden)`

> Loading.  Please wait.
> Finished loading.
> Page has 1 landmark.
> main content.
> У саду — простори: 3, рослини й тварини: 3

Observed: `{"lang": "uk", "title": "Простір саду | OverGarden"}`

### Next heading ×3 (H)

Keys: `h h h`

> h
> Простір саду heading level 1.
> h
> Простори 3 heading level 2.
> h

Voice: uk

### Account menu (focus put on its button; Enter)

Keys: `Return`

> Рослини й тварини 3 heading level 2.
> return
> leaving region.
> leaving main content.
> banner
> Акаунт push button grayed.
> opens menu

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Публічний профіль"}`

### To Sign out — Tab 1

Keys: `Tab`

> tab
> Закладки link.
> Focus mode

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Закладки"}`

### To Sign out — Tab 2

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": null, "name": "Список бажань"}`

### To Sign out — Tab 3

Keys: `Tab`

> Список бажань link.
> tab
> Запити щодо походження link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Запити щодо походження"}`

### To Sign out — Tab 4

Keys: `Tab`

> tab

Observed: `{"tag": "a", "role": null, "name": "Налаштування"}`

### To Sign out — Tab 5

Keys: `Tab`

> leaving panel.
> Налаштування panel.
> Налаштування link.
> tab

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Вхід і безпека"}`

### To Sign out — Tab 6

Keys: `Tab`

> Вхід і безпека link.
> tab

Observed: `{"tag": "a", "role": null, "name": "Приватність"}`

### To Sign out — Tab 7

Keys: `Tab`

> Приватність link.
> tab
> Видалення даних link.

Voice: uk

Observed: `{"tag": "a", "role": null, "name": "Видалення даних"}`

### To Sign out — Tab 8

Keys: `Tab`

> tab

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Вийти з акаунта"}`

### Sign out (Enter): the confirmation opens

Keys: `Return`

> leaving panel.
> Вийти з акаунта push button.
> return
> alert Завершити сеанс?
> Завершити сеанс? До успішної публікації текст залишається лише у відкритій вкладці. Чернетки не зберігаються; вихід, закриття чи перезавантаження вкладки видалить неопубліковані зміни.
> Залишитися в акаунті push button.
> Browse mode

Voice: uk

Observed: `{"tag": "button", "role": null, "name": "Залишитися в акаунті"}`

### Escape: the confirmation closes

Keys: `Escape`

> escape
> У саду — простори: 3, рослини й тварини: 3

Observed: `{"tag": "button", "role": null, "name": "Вийти з акаунта"}`

