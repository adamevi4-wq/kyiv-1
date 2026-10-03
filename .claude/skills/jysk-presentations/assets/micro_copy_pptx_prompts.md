# Python-pptx micro-copy methodology (Adam's correction, 2026-10-03)

After a deck-kit.js-generated clearance-data deck came back too text-heavy
and with uncertain conclusions, Adam sent this methodology (from an
external article on prompting AI for decks) and said: switch the default
approach to **python-pptx code generation with a micro-copy content rule**,
not deck-kit.js. Kept verbatim below; see SKILL.md's "Primary tool:
python-pptx micro-copy decks" section for how this is actually applied in
this repo.

## 1. Teach Claude to generate Python scripts (python-pptx)
Замість того щоб копіювати текст вручну, просіть Claude писати Python-код,
який автоматично створює готовий файл .pptx з потрібним дизайном,
шрифтами, кольорами та розташуванням блоків.

Приклад запиту: "Створи Python-скрипт із використанням бібліотеки
python-pptx, який згенерує презентацію з 5 слайдів на тему [Тема].
Використовуй корпоративну палітру (основний: #003366, акцент: #FF6600),
сучасні шрифти (Segoe UI), розклади текст по картках/блоках."

(For JYSK decks specifically: use the real official palette — accent1
`#143C8A` navy, Verdana — already established in SKILL.md, not a generic
example palette like the one above.)

## 2. VBA macros (no-coding alternative)
Якщо немає змоги запускати Python: просити Claude писати VBA-код для
PowerPoint ("Alt+F11 -> Insert Module -> Run"). Not used in this repo
(python-pptx is always runnable here) — noted for completeness only.

## 3. HTML/CSS or Mermaid.js for layouts/diagrams
For process/org/timeline diagrams, Mermaid.js or SVG. For card layouts,
HTML/CSS that can be opened in a browser. Overlaps with this skill's own
SVG-asset pipeline (`scripts/render_svg.js`) for one-off graphics.

## 4. Micro-copy rule (the key content constraint)
- Заборона на суцільний текст або абзаци.
- Формат: Заголовок + Теза (до 10 слів) + Цифра/Метрика.
- Формула слайда: **1 головна думка = 1 слайд.**
- Structured two-part output when planning: left/Block 1 = exact slide
  text (headline, bullets, captions); right/Block 2 = the visual
  instruction (icon choice, chart, image-generator prompt).

## 5. Prompt template (role framework)
```
Роль: Ти професійний Slide Designer та Presentation Strategist.
Задача: Розроби структуру та контент для слайда [Тема / Мета слайда].
Вимоги до форматизації:
1. Надай контент у вигляді структурованих блоків (заголовок, 3 ключові картки, висновок).
2. Скороти весь текст до фокусної витяжки (правило 6x6).
3. Запропонуй візуальне рішення (іконки, колірне виділення, розташування елементів).
4. Надай Python-код (python-pptx) для автоматичного створення файлу.
```
