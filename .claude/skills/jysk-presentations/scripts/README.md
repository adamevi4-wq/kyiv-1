# pptx-designer-kit: безкоштовний генератор дизайнерських презентацій

Код, який створює `.pptx` з градієнтними фонами, іконками, нативними діаграмами й таблицями. Усе безкоштовне й з відкритим кодом: `pptxgenjs` (MIT), `sharp`, `react-icons` (Lucide, ISC), LibreOffice (для перевірки).

## Файли

| Файл | Призначення |
|---|---|
| `deck-kit.js` | Бібліотека дизайн-системи: 6 тем, 14 макетів, іконки, фони, арт |
| `demo.js` | Приклад презентації на 13 слайдів (запуск: `node demo.js aurora`) |
| `MASTER_PROMPT.md` | 3 промти для ШІ (з кодом, без коду, для Gamma/Canva) |
| `SKILL.md` | Готовий скіл для Claude |
| `demo-*.pptx` | Приклади результату |

## Встановлення

```bash
npm i pptxgenjs sharp react react-dom react-icons
node demo.js aurora        # aurora | paper | sunset | forest | ocean | jysk
```

Для перевірки візуально: LibreOffice + poppler (`pdftoppm`).

## Мінімальний приклад

```js
const { createKit } = require('./deck-kit');
(async () => {
  const k = createKit('paper', { footer: 'Мій проєкт' });
  await k.title({ eyebrow: 'Q3', title: 'Ми **ростемо** швидше', subtitle: 'Підсумки кварталу' });
  await k.stats({ title: 'Ключові **цифри**', stats: [
    { value: '+8,4%', label: 'Продажі' }, { value: '6,1%', label: 'Конверсія' }, { value: '412 грн', label: 'Чек' } ], feature: 0 });
  await k.closing({ title: 'Дякую!', contacts: [{ icon: 'Mail', text: 'name@company.ua' }] });
  await k.save('my-deck.pptx');
})();
```

## Макети

| Метод | Що робить | Ключові поля |
|---|---|---|
| `title` | Обкладинка з арт-зображенням або фото | eyebrow, title, subtitle, meta, image |
| `agenda` | Зміст із великими номерами | title, items[{title, desc}] |
| `section` | Розділювач з гігантським номером | num, title, subtitle |
| `statement` | Одна велика теза | text, caption, icon |
| `cards` | 2–6 карток з іконками | items[{icon,title,text}], feature, takeaway |
| `stats` | Цифри-герої | stats[{value,label,note}], feature, takeaway |
| `split` | Текст + зображення | bullets[{icon,text}], image, side |
| `timeline` | 3–5 кроків | steps[{label,title,text}] |
| `compare` | Було / стало | left, right {title, items[]} |
| `chart` | Діаграма + інсайт | type: bar/line/area/doughnut, labels, series, insight |
| `table` | Стилізована таблиця | headers, rows, highlightCol, colW |
| `quote` | Цитата / відгук | text, author, role |
| `gallery` | 2–4 зображення | items[{image?, caption}] |
| `closing` | Фінал із контактами | title, subtitle, contacts |

Спільні поля будь-якого слайда: `eyebrow`, `title`, `notes` (нотатки доповідача), `takeaway` (плашка-висновок). Виділення слів: `**слово**`.

## Ваші фото

```js
await k.split({ title: '...', bullets: [...], image: './photo.jpg' });   // cover-fit + закруглені кути
await k.title({ title: '...', image: './cover.jpg' });
```

Безкоштовні фото: Unsplash, Pexels, Pixabay (перевіряйте ліцензію). Для брендових фото використовуйте власні.

## Власна тема

```js
const { createKit, THEMES } = require('./deck-kit');
THEMES.brand = {
  fonts: { head: 'Verdana', body: 'Verdana' },
  primary: '143C8A', secondary: '4BA4DF', accent: 'E30613', chart: ['143C8A','4BA4DF','9CC3E5','469419','E30613'],
  hero: { bg: '143C8A', dark: true,  text: 'FFFFFF', muted: 'CFE0F5', hl: '9CC3E5', blobs: ['034A90','4BA4DF','2E75B5'], alpha: 0.85 },
  body: { bg: 'FFFFFF', dark: false, text: '565655', muted: '7A7A79', hl: '143C8A', blobs: ['DCEAF7','EAF3FB','F1F6FC'], alpha: 0.7, cardTint: 'EEF4FB' },
};
const k = createKit('brand');
```

Тема `jysk` у комплекті лише наближає фірмовий стиль. Для офіційних презентацій беріть офіційний шаблон компанії.

## Шрифти

Назва шрифту записується у файл, а рендерить його комп'ютер глядача. Тому за замовчуванням використано шрифти, що є в Windows/macOS/Office і мають кирилицю: Georgia, Calibri, Cambria, Verdana. Шрифти з Google Fonts (Inter, Montserrat, Playfair Display) виглядають ще краще, але їх треба встановити на комп'ютері, де відкривають файл. Для PDF-експорту це не проблема.

## Перевірка якості

```bash
soffice --headless --convert-to pdf demo-aurora.pptx
pdftoppm -jpeg -r 72 demo-aurora.pdf slide     # і подивіться на кожен слайд
```

У LibreOffice Georgia замінюється ширшим шрифтом, тому там текст виглядає щільніше, ніж у PowerPoint. Якщо влізло в LibreOffice, у PowerPoint влізе з запасом.

## Обмеження

- pptxgenjs не підтримує нативних градієнтних заливок, тому фони генеруються зображеннями (їх не можна редагувати як фон, але можна замінити).
- Анімації та переходи між слайдами бібліотека не створює. Додайте їх у PowerPoint за 2 хвилини (Morph або Fade).
- Іконки й арт вставляються як зображення, а діаграми, таблиці та текст залишаються повністю редагованими.

## Інші безкоштовні варіанти

- **Marp / Slidev / reveal.js**: презентації з Markdown/HTML, найгнучкіша анімація, але не `.pptx`.
- **python-pptx**: те саме, що pptxgenjs, але на Python; дає більше контролю над існуючими шаблонами.
- **Gamma, Canva, Google Slides**: швидкий старт без коду; безкоштовні плани мають обмеження на експорт.
