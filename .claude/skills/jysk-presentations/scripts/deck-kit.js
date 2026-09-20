'use strict';
/**
 * deck-kit.js — безкоштовна дизайн-система для презентацій (pptxgenjs + sharp + react-icons)
 *
 * Що вміє:
 *  - 6 готових тем (aurora, paper, sunset, forest, ocean, jysk) + власні теми
 *  - градієнтні "mesh" фони (генеруються як зображення, бо pptx не має градієнтів у pptxgenjs)
 *  - 1500+ векторних іконок Lucide (react-icons/lu) в кольорі теми
 *  - абстрактні арт-зображення та закруглені фото (cover-fit + маска)
 *  - 14 макетів: title, agenda, section, statement, cards, stats, split, timeline,
 *    compare, chart, table, quote, gallery, closing
 *  - нативні (редаговані) діаграми PowerPoint, нативні таблиці, нотатки доповідача
 *
 * Запуск: NODE_PATH=$(npm root -g) node your-deck.js
 * Залежності: npm i pptxgenjs sharp react react-dom react-icons
 */
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const LU = require('react-icons/lu');

const W = 13.333;
const H = 7.5;
const M = 0.7; // поля

// ───────────────────────────── ТЕМИ ─────────────────────────────
// primary/secondary/accent — кольори акцентів; body/hero — палітри контентних та "обкладинкових" слайдів
const THEMES = {
  aurora: {
    fonts: { head: 'Georgia', body: 'Calibri' },
    primary: '7C5CFF', secondary: '22D3EE', accent: 'FF6B9A',
    chart: ['7C5CFF', '22D3EE', 'FF6B9A', 'FFC857', '5EEAD4'],
    hero: { bg: '0B1020', dark: true, text: 'F5F7FF', muted: 'B4BBDD', hl: '22D3EE', blobs: ['7C5CFF', '22D3EE', 'FF6B9A'], alpha: 0.85 },
    body: { bg: '0F1428', dark: true, text: 'F5F7FF', muted: 'AEB6DA', hl: '22D3EE', blobs: ['7C5CFF', '22D3EE', 'FF6B9A'], alpha: 0.45 },
  },
  paper: {
    fonts: { head: 'Georgia', body: 'Calibri' },
    primary: '2456E8', secondary: '0EA5A4', accent: 'F59E0B',
    chart: ['2456E8', '0EA5A4', 'F59E0B', '8B5CF6', '64748B'],
    hero: { bg: '0E1B3D', dark: true, text: 'FFFFFF', muted: 'B9C6EC', hl: '7DD3FC', blobs: ['2456E8', '0EA5A4', '8B5CF6'], alpha: 0.8 },
    body: { bg: 'F6F8FC', dark: false, text: '0F172A', muted: '5B6785', hl: '2456E8', blobs: ['93B4FF', '9BE7E0', 'FFD79A'], alpha: 0.35 },
  },
  sunset: {
    fonts: { head: 'Georgia', body: 'Calibri' },
    primary: 'FF7A45', secondary: 'FFC857', accent: 'E63E6D',
    chart: ['FF7A45', 'FFC857', 'E63E6D', 'B76BFF', '6EE7B7'],
    hero: { bg: '1A0F1F', dark: true, text: 'FFF7F0', muted: 'D9BFC9', hl: 'FFC857', blobs: ['FF7A45', 'E63E6D', 'FFC857'], alpha: 0.8 },
    body: { bg: '1E1224', dark: true, text: 'FFF7F0', muted: 'D3B9C4', hl: 'FFC857', blobs: ['FF7A45', 'E63E6D', 'B76BFF'], alpha: 0.4 },
  },
  forest: {
    fonts: { head: 'Cambria', body: 'Calibri' },
    primary: '1F6B4A', secondary: '7FB069', accent: 'E07A2F',
    chart: ['1F6B4A', '7FB069', 'E07A2F', '3B82A0', 'A3A380'],
    hero: { bg: '0F2A1E', dark: true, text: 'F2FAF4', muted: 'B5D3C1', hl: 'B7E4A0', blobs: ['1F6B4A', '7FB069', 'E07A2F'], alpha: 0.75 },
    body: { bg: 'F2F7F1', dark: false, text: '14281D', muted: '56695D', hl: '1F6B4A', blobs: ['A8D5B5', 'D7EBC0', 'FAD3AC'], alpha: 0.45 },
  },
  ocean: {
    fonts: { head: 'Cambria', body: 'Calibri' },
    primary: '0B6E99', secondary: '19B5C8', accent: 'FF8A5B',
    chart: ['0B6E99', '19B5C8', 'FF8A5B', '1E3A8A', '94A3B8'],
    hero: { bg: '06213A', dark: true, text: 'F0F9FF', muted: 'A8C8DD', hl: '67E8F9', blobs: ['0B6E99', '19B5C8', '1E3A8A'], alpha: 0.85 },
    body: { bg: 'F3F9FC', dark: false, text: '0B2540', muted: '54718A', hl: '0B6E99', blobs: ['A5D8F0', 'B6F0F5', 'FFD2BD'], alpha: 0.4 },
  },
  // Наближення до фірмового стилю JYSK (Verdana, navy 143C8A, Dark Grey 565655, заокруглення, "Blue Line").
  // Для офіційних презентацій використовуйте офіційний шаблон JYSK — це лише візуальне наближення.
  jysk: {
    fonts: { head: 'Verdana', body: 'Verdana' },
    titleRule: true,
    art: ['143C8A', '4BA4DF', '9CC3E5'],
    primary: '143C8A', secondary: '4BA4DF', accent: 'E30613',
    chart: ['143C8A', '4BA4DF', '9CC3E5', '469419', 'E30613'],
    hero: { bg: '143C8A', dark: true, text: 'FFFFFF', muted: 'CFE0F5', hl: '9CC3E5', blobs: ['034A90', '4BA4DF', '2E75B5'], alpha: 0.85 },
    body: { bg: 'FFFFFF', dark: false, text: '565655', muted: '7A7A79', hl: '143C8A', blobs: ['DCEAF7', 'EAF3FB', 'F1F6FC'], alpha: 0.7, cardTint: 'EEF4FB' },
  },
};

// ───────────────────────────── ДОПОМІЖНЕ ─────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "Слово **виділене** слово" → масив runs з акцентним кольором. Створює нові об'єкти щоразу. */
function rich(text, base, hl) {
  return String(text).split('**').map((p, i) => ({
    text: p,
    options: Object.assign({}, base, i % 2 ? { color: hl, bold: true } : {}),
  })).filter((r) => r.text !== '');
}

/** Підбір розміру шрифту, щоб короткий текст (цифра) не переносився: ~0.78em на символ (з запасом для широких шрифтів) */
const fitSize = (text, widthIn, base) => Math.max(24, Math.min(base, Math.floor((widthIn * 72) / (String(text).length * 0.78))));

const shadowFor = () => ({ type: 'outer', color: '1B2A4A', opacity: 0.12, blur: 18, offset: 4, angle: 90 });

// ───────────────────────────── ГЕНЕРАЦІЯ ЗОБРАЖЕНЬ ─────────────────────────────
const _cache = new Map();

/** Градієнтний mesh-фон 1920x1080 (JPEG) */
async function meshBackground(pal, variant) {
  const key = `mesh|${pal.bg}|${pal.blobs.join('')}|${pal.alpha}|${variant}`;
  if (_cache.has(key)) return _cache.get(key);
  const layouts = {
    hero: [[0.88, 0.12, 560], [0.12, 1.0, 520], [0.62, 0.78, 380]],
    a: [[1.0, 0.0, 440], [0.0, 1.0, 380], [0.55, 1.1, 260]],
    b: [[0.0, 0.0, 400], [1.0, 1.0, 440], [0.4, -0.1, 240]],
    c: [[0.95, 1.05, 460], [0.05, 0.05, 320], [0.6, 0.0, 220]],
  };
  const L = layouts[variant] || layouts.a;
  const circles = L.map(([cx, cy, r], i) =>
    `<circle cx="${cx * 1920}" cy="${cy * 1080}" r="${r}" fill="#${pal.blobs[i % pal.blobs.length]}" fill-opacity="${pal.alpha}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="120"/></filter></defs>
    <rect width="1920" height="1080" fill="#${pal.bg}"/><g filter="url(#b)">${circles}</g></svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  const data = 'image/jpeg;base64,' + buf.toString('base64');
  _cache.set(key, data);
  return data;
}

/** Векторна іконка Lucide → PNG base64 у заданому кольорі. name: 'Target' або 'LuTarget' */
async function icon(name, color, px = 256) {
  const key = `icon|${name}|${color}|${px}`;
  if (_cache.has(key)) return _cache.get(key);
  const comp = LU[name] || LU['Lu' + name];
  if (!comp) throw new Error(`Іконки "${name}" немає у Lucide. Приклади: Target, TrendingUp, Users, Store, Rocket…`);
  let svg = renderToStaticMarkup(React.createElement(comp, { size: String(px) }));
  svg = svg.replace(/currentColor/g, '#' + color);
  const buf = await sharp(Buffer.from(svg), { density: 300 }).resize(px, px).png().toBuffer();
  const data = 'image/png;base64,' + buf.toString('base64');
  _cache.set(key, data);
  return data;
}

/** Абстрактна декоративна картинка із закругленими кутами (коли немає фото) */
async function artImage(colors, wIn, hIn, radiusIn = 0.35, seed = 1) {
  const key = `art|${colors.join('')}|${wIn}|${hIn}|${radiusIn}|${seed}`;
  if (_cache.has(key)) return _cache.get(key);
  const k = 150; const w = Math.round(wIn * k); const h = Math.round(hIn * k); const r = radiusIn * k;
  const rnd = mulberry32(seed * 9973);
  const [c1, c2, c3] = colors;
  let shapes = '';
  for (let i = 0; i < 4; i++) {
    const c = [c1, c2, c3][i % 3];
    shapes += `<circle cx="${rnd() * w}" cy="${rnd() * h}" r="${(0.25 + rnd() * 0.35) * Math.max(w, h)}" fill="#${c}" fill-opacity="${0.35 + rnd() * 0.35}"/>`;
  }
  let rings = '';
  const rx = w * (0.3 + rnd() * 0.4); const ry = h * (0.3 + rnd() * 0.4);
  for (let i = 1; i <= 6; i++) rings += `<circle cx="${rx}" cy="${ry}" r="${i * w * 0.09}" fill="none" stroke="#FFFFFF" stroke-opacity="${0.22 - i * 0.025}" stroke-width="2"/>`;
  let dots = '';
  for (let x = 0; x < 9; x++) for (let y = 0; y < 6; y++) dots += `<circle cx="${w * 0.08 + x * 26}" cy="${h * 0.9 - y * 26}" r="3" fill="#FFFFFF" fill-opacity="0.35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${c1}"/><stop offset="1" stop-color="#${c3}"/></linearGradient>
      <filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${Math.round(w / 14)}"/></filter>
      <clipPath id="c"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></clipPath>
    </defs>
    <g clip-path="url(#c)"><rect width="${w}" height="${h}" fill="url(#g)"/><g filter="url(#b)">${shapes}</g>${rings}${dots}</g></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const data = 'image/png;base64,' + buf.toString('base64');
  _cache.set(key, data);
  return data;
}

/** Реальне фото → cover-fit + закруглені кути. src: шлях або Buffer */
async function roundedPhoto(src, wIn, hIn, radiusIn = 0.3) {
  const k = 200; const w = Math.round(wIn * k); const h = Math.round(hIn * k); const r = radiusIn * k;
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  const buf = await sharp(src).resize(w, h, { fit: 'cover', position: 'attention' })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

// ───────────────────────────── KIT ─────────────────────────────
function createKit(themeOrName = 'aurora', opts = {}) {
  const theme = typeof themeOrName === 'string' ? THEMES[themeOrName] : themeOrName;
  if (!theme) throw new Error('Невідома тема. Доступні: ' + Object.keys(THEMES).join(', '));
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
  pres.title = opts.title || 'Presentation';
  pres.author = opts.author || '';
  const F = theme.fonts;
  // Автоконтраст: колір тексту на акцентній заливці (білий або темний — що контрастніший, WCAG)
  const lum = (hex) => { const c = [0, 2, 4].map((i) => { const v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const L = lum(theme.primary);
  const onP = 1.05 / (L + 0.05) >= (L + 0.05) / 0.06 ? 'FFFFFF' : '1A1420';
  const onPm = onP === 'FFFFFF' ? 'E6ECFF' : '3A2A2A';
  const artColors = theme.art || [theme.primary, theme.secondary, theme.accent];
  let count = 0;
  let variantIdx = 0;
  const variants = ['a', 'b', 'c'];

  // Палітра слайда залежно від режиму (hero/body)
  const P = (mode) => {
    const m = theme[mode];
    return Object.assign({}, m, {
      mode,
      primary: theme.primary, secondary: theme.secondary, accent: theme.accent,
      cardFill: m.dark ? 'FFFFFF' : (m.cardTint ? m.cardTint : 'FFFFFF'),
      cardTransp: m.dark ? 91 : 0,
      cardLine: m.dark ? { color: 'FFFFFF', width: 0.75, transparency: 82 } : { color: 'E3E8F1', width: 0.75 },
      shadow: !m.dark && !m.cardTint,
    });
  };

  async function newSlide(mode, variant, notes) {
    const s = pres.addSlide();
    const p = P(mode);
    const v = variant || (mode === 'hero' ? 'hero' : variants[variantIdx++ % variants.length]);
    s.background = { data: await meshBackground(p, v) };
    count += 1;
    if (notes) s.addNotes(notes);
    return { s, p, n: count };
  }

  // Картка (заокруглений контейнер)
  function card(s, p, x, y, w, h, o = {}) {
    const fill = o.fill ? { color: o.fill } : { color: p.cardFill, transparency: p.cardTransp };
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({
      x, y, w, h, rectRadius: o.r == null ? 0.28 : o.r, fill,
      line: o.fill ? { color: o.fill, width: 0.5 } : p.cardLine,
    }, (p.shadow || o.shadow) && !o.noShadow ? { shadow: shadowFor() } : {}));
  }

  async function badge(s, p, x, y, d, name, color, o = {}) {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: o.solid ? color : color, transparency: o.solid ? 0 : 82 }, line: { color, width: 0.5, transparency: 100 } });
    const pad = d * 0.27;
    s.addImage({ data: await icon(name, o.iconColor || (o.solid ? 'FFFFFF' : color)), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
  }

  function footer(s, p, n, label) {
    const c = p.muted;
    s.addText(label || opts.footer || '', { x: M, y: 7.0, w: 8, h: 0.3, fontFace: F.body, fontSize: 10, color: c, margin: 0, isTextBox: true });
    s.addText(String(n).padStart(2, '0'), { x: W - M - 1, y: 7.0, w: 1, h: 0.3, fontFace: F.body, fontSize: 10, color: c, align: 'right', margin: 0, isTextBox: true });
  }

  function header(s, p, o, width = W - 2 * M) {
    const rule = !!theme.titleRule; // "Blue Line" тема: заголовок 28pt + лінія під ним
    if (o.eyebrow) {
      s.addText(String(o.eyebrow).toUpperCase(), { x: M, y: rule ? 0.42 : 0.55, w: width, h: 0.3, fontFace: F.body, fontSize: 12, bold: true, color: p.hl, charSpacing: 3, margin: 0, isTextBox: true });
    }
    s.addText(rich(o.title, { fontFace: F.head, fontSize: o.titleSize || (rule ? 28 : 34), bold: true, color: p.text }, p.hl),
      { x: M, y: rule ? 0.75 : 0.9, w: width, h: rule ? 1.05 : 1.0, valign: 'top', margin: 0, isTextBox: true });
    if (rule) {
      s.addShape(pres.shapes.RECTANGLE, { x: M, y: 1.93, w: width, h: 0.03, fill: { color: theme.primary }, line: { color: theme.primary, width: 0 } });
    }
  }

  // Плашка-висновок унизу слайда ("ПАМ'ЯТАЙТЕ")
  async function callout(s, p, text, label) {
    const y = 6.0; const h = 0.78;
    card(s, p, M, y, W - 2 * M, h, { r: 0.2, noShadow: true, fill: undefined });
    await badge(s, p, M + 0.22, y + 0.14, 0.5, 'Lightbulb', p.hl);
    s.addText(rich(`**${label || 'Висновок'}:** ${text}`, { fontFace: F.body, fontSize: 16, color: p.text }, p.hl),
      { x: M + 0.95, y, w: W - 2 * M - 1.2, h, valign: 'middle', margin: 0, isTextBox: true });
  }
  const bottom = (takeaway) => (takeaway ? 5.75 : 6.65);

  // ───────── МАКЕТИ ─────────

  /** Титульний слайд. o: {eyebrow,title,subtitle,meta,image,notes} */
  async function title(o) {
    const { s, p } = await newSlide('hero', 'hero', o.notes);
    const pillW = Math.min(7.5, 0.7 + String(o.eyebrow || '').length * 0.15);
    if (o.eyebrow) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: 0.95, w: pillW, h: 0.42, rectRadius: 0.21, fill: { color: 'FFFFFF', transparency: 88 }, line: { color: 'FFFFFF', width: 0.75, transparency: 75 } });
      s.addText(String(o.eyebrow).toUpperCase(), { x: 0.9, y: 0.95, w: pillW, h: 0.42, align: 'center', valign: 'middle', fontFace: F.body, fontSize: 12, bold: true, color: p.hl, charSpacing: 3, margin: 0, isTextBox: true });
    }
    s.addText(rich(o.title, { fontFace: F.head, fontSize: 52, bold: true, color: p.text }, p.hl),
      { x: 0.9, y: 1.85, w: 7.5, h: 3.0, valign: 'top', margin: 0, isTextBox: true });
    if (o.subtitle) s.addText(o.subtitle, { x: 0.9, y: 4.95, w: 7.2, h: 1.0, fontFace: F.body, fontSize: 20, color: p.muted, valign: 'top', margin: 0, isTextBox: true });
    if (o.meta) s.addText(o.meta, { x: 0.9, y: 6.5, w: 7.5, h: 0.35, fontFace: F.body, fontSize: 14, color: p.muted, margin: 0, isTextBox: true });
    const img = o.image ? await roundedPhoto(o.image, 3.9, 5.7, 0.4) : await artImage(artColors, 3.9, 5.7, 0.4, 7);
    s.addImage({ data: img, x: 8.75, y: 0.9, w: 3.9, h: 5.7 });
    return s;
  }

  /** Зміст. o: {title, items:[{title, desc}]} */
  async function agenda(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    s.addText(rich(o.title || 'Зміст', { fontFace: F.head, fontSize: 36, bold: true, color: p.text }, p.hl), { x: M, y: 0.9, w: 4.4, h: 2.2, valign: 'top', margin: 0, isTextBox: true });
    if (o.eyebrow) s.addText(o.eyebrow.toUpperCase(), { x: M, y: 0.55, w: 4, h: 0.3, fontFace: F.body, fontSize: 12, bold: true, color: p.hl, charSpacing: 3, margin: 0, isTextBox: true });
    const items = o.items; const x0 = 5.4; const gap = 0.18;
    const rowH = Math.min(1.0, (5.6 - gap * (items.length - 1)) / items.length);
    for (let i = 0; i < items.length; i++) {
      const y = 0.9 + i * (rowH + gap);
      card(s, p, x0, y, W - M - x0, rowH, { r: 0.22 });
      s.addText(String(i + 1).padStart(2, '0'), { x: x0 + 0.3, y, w: 0.9, h: rowH, fontFace: F.head, fontSize: 28, bold: true, color: p.hl, valign: 'middle', margin: 0, isTextBox: true });
      const hasDesc = !!items[i].desc;
      s.addText(items[i].title, { x: x0 + 1.25, y: hasDesc ? y + 0.1 : y, w: W - M - x0 - 1.5, h: hasDesc ? rowH * 0.5 : rowH, fontFace: F.body, fontSize: 20, bold: true, color: p.text, valign: hasDesc ? 'bottom' : 'middle', margin: 0, isTextBox: true });
      if (hasDesc) s.addText(items[i].desc, { x: x0 + 1.25, y: y + rowH * 0.52, w: W - M - x0 - 1.5, h: rowH * 0.4, fontFace: F.body, fontSize: 14, color: p.muted, valign: 'top', margin: 0, isTextBox: true });
    }
    footer(s, p, n);
    return s;
  }

  /** Розділювач. o: {num, title, subtitle} */
  async function section(o) {
    const { s, p } = await newSlide('hero', 'hero', o.notes);
    s.addText(String(o.num || '').padStart(2, '0'), { x: 6.2, y: 0.4, w: 7, h: 6.4, align: 'right', valign: 'middle', fontFace: F.head, fontSize: 300, bold: true, color: 'FFFFFF', transparency: 90, margin: 0, isTextBox: true });
    s.addText(String(o.eyebrow || 'Розділ').toUpperCase(), { x: 0.9, y: 2.3, w: 6, h: 0.3, fontFace: F.body, fontSize: 13, bold: true, color: p.hl, charSpacing: 4, margin: 0, isTextBox: true });
    s.addText(rich(o.title, { fontFace: F.head, fontSize: 48, bold: true, color: p.text }, p.hl), { x: 0.9, y: 2.75, w: 8.2, h: 1.9, valign: 'top', margin: 0, isTextBox: true });
    if (o.subtitle) s.addText(o.subtitle, { x: 0.9, y: 4.75, w: 7.2, h: 1, fontFace: F.body, fontSize: 20, color: p.muted, valign: 'top', margin: 0, isTextBox: true });
    return s;
  }

  /** Велике твердження / ключова теза. o: {text, caption, icon} — ** для акценту */
  async function statement(o) {
    const { s, p } = await newSlide('hero', 'hero', o.notes);
    await badge(s, p, 0.9, 1.2, 0.85, o.icon || 'Sparkles', p.hl);
    s.addText(rich(o.text, { fontFace: F.head, fontSize: 40, bold: true, color: p.text }, p.hl), { x: 0.9, y: 2.3, w: 11.2, h: 3.3, valign: 'top', margin: 0, isTextBox: true });
    if (o.caption) s.addText(o.caption, { x: 0.9, y: 5.6, w: 10, h: 0.5, fontFace: F.body, fontSize: 18, color: p.muted, margin: 0, isTextBox: true });
    return s;
  }

  /** Картки 2-6 шт. o: {eyebrow,title,items:[{icon,title,text}], feature:index, takeaway} */
  async function cards(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const items = o.items; const cols = items.length <= 4 ? items.length : 3; const rows = Math.ceil(items.length / cols);
    const gap = 0.3; const top = 2.25; const cw = (W - 2 * M - gap * (cols - 1)) / cols;
    const ch = (bottom(o.takeaway) - top - gap * (rows - 1)) / rows;
    const cycle = [theme.primary, theme.secondary, theme.accent];
    for (let i = 0; i < items.length; i++) {
      const c = i % cols; const r = Math.floor(i / cols); const x = M + c * (cw + gap); const y = top + r * (ch + gap);
      const feat = o.feature === i;
      card(s, p, x, y, cw, ch, feat ? { fill: theme.primary } : {});
      const col = cycle[i % 3];
      const tc = feat ? onP : p.text; const mc = feat ? onPm : p.muted;
      if (rows === 1) {
        await badge(s, p, x + 0.35, y + 0.35, 0.85, items[i].icon || 'Star', feat ? onP : col);
        s.addText(items[i].title, { x: x + 0.35, y: y + 1.4, w: cw - 0.7, h: 0.9, fontFace: F.head, fontSize: 21, bold: true, color: tc, valign: 'top', margin: 0, isTextBox: true });
        s.addText(items[i].text, { x: x + 0.35, y: y + 2.3, w: cw - 0.7, h: ch - 2.5, fontFace: F.body, fontSize: 16, color: mc, valign: 'top', margin: 0, isTextBox: true });
      } else {
        await badge(s, p, x + 0.3, y + 0.3, 0.65, items[i].icon || 'Star', feat ? onP : col);
        s.addText(items[i].title, { x: x + 1.15, y: y + 0.25, w: cw - 1.4, h: 0.75, fontFace: F.head, fontSize: 18, bold: true, color: tc, valign: 'middle', margin: 0, isTextBox: true });
        s.addText(items[i].text, { x: x + 0.3, y: y + 1.1, w: cw - 0.6, h: ch - 1.25, fontFace: F.body, fontSize: 14, color: mc, valign: 'top', margin: 0, isTextBox: true });
      }
    }
    if (o.takeaway) await callout(s, p, o.takeaway, o.takeawayLabel);
    footer(s, p, n);
    return s;
  }

  /** Великі цифри. o: {eyebrow,title,stats:[{value,label,note}], feature:0, takeaway} */
  async function stats(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const items = o.stats; const gap = 0.3; const top = 2.3; const cw = (W - 2 * M - gap * (items.length - 1)) / items.length; const ch = bottom(o.takeaway) - top;
    items.forEach((it, i) => {
      const x = M + i * (cw + gap); const feat = o.feature === i;
      card(s, p, x, top, cw, ch, feat ? { fill: theme.primary } : {});
      s.addText(it.value, { x: x + 0.35, y: top + 0.35, w: cw - 0.7, h: 1.5, fontFace: F.head, fontSize: fitSize(it.value, cw - 0.7, items.length > 3 ? 48 : 58), bold: true, color: feat ? onP : p.hl, valign: 'middle', margin: 0, isTextBox: true });
      s.addText(it.label, { x: x + 0.35, y: top + 1.95, w: cw - 0.7, h: 0.8, fontFace: F.body, fontSize: 18, bold: true, color: feat ? onP : p.text, valign: 'top', margin: 0, isTextBox: true });
      if (it.note) s.addText(it.note, { x: x + 0.35, y: top + 2.75, w: cw - 0.7, h: ch - 2.95, fontFace: F.body, fontSize: 14, color: feat ? onPm : p.muted, valign: 'top', margin: 0, isTextBox: true });
    });
    if (o.takeaway) await callout(s, p, o.takeaway, o.takeawayLabel);
    footer(s, p, n);
    return s;
  }

  /** Текст + зображення. o: {eyebrow,title,bullets:[{icon?,text}|string], image?, side:'right'|'left', seed} */
  async function split(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    const left = o.side === 'left'; const iw = 5.1; const ih = 6.1; const ix = left ? M : W - M - iw; const tx = left ? M + iw + 0.6 : M; const tw = W - 2 * M - iw - 0.6;
    const hdr = { eyebrow: o.eyebrow, title: o.title };
    // заголовок зміщуємо у колонку тексту
    if (o.eyebrow) s.addText(String(o.eyebrow).toUpperCase(), { x: tx, y: 0.55, w: tw, h: 0.3, fontFace: F.body, fontSize: 12, bold: true, color: p.hl, charSpacing: 3, margin: 0, isTextBox: true });
    s.addText(rich(hdr.title, { fontFace: F.head, fontSize: 28, bold: true, color: p.text }, p.hl), { x: tx, y: 0.9, w: tw, h: 1.7, valign: 'top', margin: 0, isTextBox: true });
    const img = o.image ? await roundedPhoto(o.image, iw, ih, 0.35) : await artImage(artColors, iw, ih, 0.35, o.seed || 3);
    s.addImage({ data: img, x: ix, y: 0.7, w: iw, h: ih });
    const list = o.bullets.map((b) => (typeof b === 'string' ? { text: b } : b));
    const rowH = Math.min(1.05, 3.9 / list.length); const y0 = 2.85;
    for (let i = 0; i < list.length; i++) {
      const y = y0 + i * rowH;
      await badge(s, p, tx, y + 0.05, 0.5, list[i].icon || 'Check', [theme.primary, theme.secondary, theme.accent][i % 3]);
      s.addText(rich(list[i].text, { fontFace: F.body, fontSize: 17, color: p.text }, p.hl), { x: tx + 0.75, y, w: tw - 0.75, h: rowH - 0.1, valign: 'top', margin: 0, isTextBox: true });
    }
    footer(s, p, n);
    return s;
  }

  /** Таймлайн/процес 3-5 кроків. o: {eyebrow,title,steps:[{label,title,text}], takeaway} */
  async function timeline(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const st = o.steps; const gap = 0.25; const cw = (W - 2 * M - gap * (st.length - 1)) / st.length;
    const lineY = 2.6; const d = 0.62;
    s.addShape(pres.shapes.RECTANGLE, { x: M + cw / 2, y: lineY + d / 2 - 0.015, w: (st.length - 1) * (cw + gap), h: 0.03, fill: { color: p.muted, transparency: 65 }, line: { color: p.muted, width: 0, transparency: 100 } });
    st.forEach((it, i) => {
      const x = M + i * (cw + gap); const cx = x + cw / 2 - d / 2;
      s.addShape(pres.shapes.OVAL, { x: cx, y: lineY, w: d, h: d, fill: { color: theme.primary }, line: { color: p.dark ? p.bg : 'FFFFFF', width: 3 } });
      s.addText(String(i + 1), { x: cx, y: lineY, w: d, h: d, align: 'center', valign: 'middle', fontFace: F.head, fontSize: 18, bold: true, color: onP, margin: 0, isTextBox: true });
      const cy = 3.55; const chh = bottom(o.takeaway) - cy;
      card(s, p, x, cy, cw, chh, { r: 0.24 });
      if (it.label) s.addText(String(it.label).toUpperCase(), { x: x + 0.28, y: cy + 0.25, w: cw - 0.56, h: 0.3, fontFace: F.body, fontSize: 12, bold: true, color: p.hl, charSpacing: 2, margin: 0, isTextBox: true });
      s.addText(it.title, { x: x + 0.28, y: cy + 0.6, w: cw - 0.56, h: 0.8, fontFace: F.head, fontSize: 20, bold: true, color: p.text, valign: 'top', margin: 0, isTextBox: true });
      s.addText(it.text, { x: x + 0.28, y: cy + 1.5, w: cw - 0.56, h: chh - 1.65, fontFace: F.body, fontSize: 16, color: p.muted, valign: 'top', margin: 0, isTextBox: true });
    });
    if (o.takeaway) await callout(s, p, o.takeaway, o.takeawayLabel);
    footer(s, p, n);
    return s;
  }

  /** Порівняння "було/стало". o: {eyebrow,title,left:{title,items[]},right:{title,items[]}} */
  async function compare(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const gap = 0.4; const cw = (W - 2 * M - gap) / 2; const top = 2.25; const ch = bottom(o.takeaway) - top;
    const sides = [{ d: o.left, x: M, feat: false }, { d: o.right, x: M + cw + gap, feat: true }];
    for (const sd of sides) {
      card(s, p, sd.x, top, cw, ch, sd.feat ? { fill: theme.primary } : {});
      s.addText(sd.d.title, { x: sd.x + 0.4, y: top + 0.3, w: cw - 0.8, h: 0.6, fontFace: F.head, fontSize: 24, bold: true, color: sd.feat ? onP : p.text, margin: 0, valign: 'middle', isTextBox: true });
      const rowH = Math.min(0.75, (ch - 1.3) / sd.d.items.length);
      for (let i = 0; i < sd.d.items.length; i++) {
        const y = top + 1.1 + i * rowH;
        await badge(s, p, sd.x + 0.4, y + 0.07, 0.42, sd.feat ? 'Check' : 'X', sd.feat ? onP : theme.accent);
        s.addText(sd.d.items[i], { x: sd.x + 1.05, y, w: cw - 1.45, h: rowH - 0.05, fontFace: F.body, fontSize: 16, color: sd.feat ? onP : p.text, valign: 'top', margin: 0, isTextBox: true });
      }
    }
    if (o.takeaway) await callout(s, p, o.takeaway, o.takeawayLabel);
    footer(s, p, n);
    return s;
  }

  /** Діаграма + інсайт. o:{eyebrow,title,type:'bar'|'line'|'area'|'doughnut',labels,series:[{name,values}],insight:{value,label,text}} */
  async function chart(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const top = 2.2; const ch = 4.5; const cw = 8.0;
    card(s, p, M, top, cw, ch, { r: 0.28 });
    const data = o.series.map((se) => ({ name: se.name, labels: o.labels, values: se.values }));
    let colors = theme.chart;
    if (o.series.length === 1 && o.type !== 'doughnut' && o.type !== 'line' && o.type !== 'area') {
      const vals = o.series[0].values; const hi = o.highlight != null ? o.highlight : vals.indexOf(Math.max(...vals));
      colors = vals.map((_, i) => (i === hi ? theme.chart[1] : theme.chart[0])); // один колір + акцент на лідері
    }
    const common = { x: M + 0.25, y: top + 0.2, w: cw - 0.5, h: ch - 0.4, chartColors: colors, catAxisLabelColor: p.muted, valAxisLabelColor: p.muted, catAxisLabelFontFace: F.body, valAxisLabelFontFace: F.body, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, showLegend: o.series.length > 1, legendPos: 'b', legendColor: p.muted, legendFontFace: F.body, legendFontSize: 12 };
    const grid = { valGridLine: { color: p.dark ? '3A4166' : 'E3E8F1', size: 0.75 }, catGridLine: { style: 'none' }, valAxisLineShow: false, catAxisLineShow: false };
    if (o.type === 'doughnut') {
      s.addChart(pres.charts.DOUGHNUT, data, Object.assign({}, common, { holeSize: 62, showPercent: true, showLegend: true, legendPos: 'r', dataLabelColor: 'FFFFFF', dataLabelFontSize: 12, dataLabelFontBold: true, dataBorder: { pt: 3, color: p.dark ? p.bg : 'FFFFFF' } }));
    } else if (o.type === 'line' || o.type === 'area') {
      s.addChart(o.type === 'line' ? pres.charts.LINE : pres.charts.AREA, data, Object.assign({}, common, grid, { lineSize: 3, lineDataSymbolSize: 8, showValue: false }));
    } else {
      s.addChart(pres.charts.BAR, data, Object.assign({}, common, grid, { barDir: 'col', barGapWidthPct: 55, valAxisMinVal: o.min == null ? 0 : o.min, showValue: true, dataLabelColor: p.text, dataLabelFontSize: 11, dataLabelFontFace: F.body, dataLabelPosition: 'outEnd', dataLabelFormatCode: o.format || '#,##0' }));
    }
    const ix = M + cw + 0.3; const iw = W - M - ix;
    card(s, p, ix, top, iw, ch, { fill: theme.primary });
    const ins = o.insight || {};
    s.addText(ins.value || '', { x: ix + 0.35, y: top + 0.4, w: iw - 0.7, h: 1.2, fontFace: F.head, fontSize: fitSize(ins.value || '', iw - 0.7, 48), bold: true, color: onP, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(ins.label || '', { x: ix + 0.35, y: top + 1.65, w: iw - 0.7, h: 0.7, fontFace: F.body, fontSize: 16, bold: true, color: onP, valign: 'top', margin: 0, isTextBox: true });
    s.addText(ins.text || '', { x: ix + 0.35, y: top + 2.4, w: iw - 0.7, h: ch - 2.6, fontFace: F.body, fontSize: 14, color: onPm, valign: 'top', margin: 0, isTextBox: true });
    footer(s, p, n);
    return s;
  }

  /** Таблиця. o:{eyebrow,title,headers[],rows[][], highlightCol?, colW?} */
  async function table(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const top = 2.2; const totalH = bottom(o.takeaway) - top;
    const rowH = Math.min(0.72, (totalH - 0.5) / (o.rows.length + 1));
    const tw = W - 2 * M - 0.7;
    const colW = o.colW ? o.colW.map((c) => (c * tw) / o.colW.reduce((a, b) => a + b, 0)) : undefined;
    card(s, p, M, top, W - 2 * M, Math.min(totalH, 0.5 + rowH * (o.rows.length + 1)), { r: 0.28 });
    const border = { type: 'solid', color: p.dark ? '3A4166' : 'E3E8F1', pt: 0.75 };
    const none = { type: 'none' };
    const hdr = o.headers.map((h, i) => ({ text: String(h).toUpperCase(), options: { bold: true, fontSize: 11, color: p.muted, fontFace: F.body, align: i === 0 ? 'left' : 'right', valign: 'middle', border: [none, none, border, none], charSpacing: 1.5 } }));
    const rows = o.rows.map((r) => r.map((c, i) => ({ text: String(c), options: { fontSize: 16, fontFace: F.body, color: i === o.highlightCol ? p.hl : p.text, bold: i === 0 || i === o.highlightCol, align: i === 0 ? 'left' : 'right', valign: 'middle', border: [none, none, border, none] } })));
    s.addTable([hdr, ...rows], { x: M + 0.35, y: top + 0.25, w: tw, colW, rowH, margin: [0, 0.1, 0, 0.1] });
    if (o.takeaway) await callout(s, p, o.takeaway, o.takeawayLabel);
    footer(s, p, n);
    return s;
  }

  /** Цитата/відгук. o:{text,author,role} */
  async function quote(o) {
    const { s, p } = await newSlide('hero', 'hero', o.notes);
    s.addImage({ data: await icon('Quote', p.hl, 256), x: 0.9, y: 1.0, w: 1.0, h: 1.0 });
    s.addText(rich(o.text, { fontFace: F.head, fontSize: 34, color: p.text, italic: true }, p.hl), { x: 0.9, y: 2.2, w: 11.2, h: 3.0, valign: 'top', margin: 0, isTextBox: true });
    const initials = String(o.author || '').split(' ').map((w) => w[0]).slice(0, 2).join('');
    s.addShape(pres.shapes.OVAL, { x: 0.9, y: 5.6, w: 0.85, h: 0.85, fill: { color: theme.primary }, line: { color: 'FFFFFF', width: 1.5, transparency: 60 } });
    s.addText(initials, { x: 0.9, y: 5.6, w: 0.85, h: 0.85, align: 'center', valign: 'middle', fontFace: F.head, fontSize: 22, bold: true, color: onP, margin: 0, isTextBox: true });
    s.addText(o.author || '', { x: 2.0, y: 5.6, w: 8, h: 0.45, fontFace: F.body, fontSize: 18, bold: true, color: p.text, margin: 0, valign: 'bottom', isTextBox: true });
    s.addText(o.role || '', { x: 2.0, y: 6.05, w: 8, h: 0.4, fontFace: F.body, fontSize: 14, color: p.muted, margin: 0, valign: 'top', isTextBox: true });
    return s;
  }

  /** Галерея 2-4 зображень із підписами. o:{eyebrow,title,items:[{image?,caption,seed}]} */
  async function gallery(o) {
    const { s, p, n } = await newSlide('body', undefined, o.notes);
    header(s, p, o);
    const it = o.items; const gap = 0.3; const cw = (W - 2 * M - gap * (it.length - 1)) / it.length; const top = 2.2; const ih = 3.9;
    for (let i = 0; i < it.length; i++) {
      const x = M + i * (cw + gap);
      const img = it[i].image ? await roundedPhoto(it[i].image, cw, ih, 0.28) : await artImage(artColors.sort(() => 0), cw, ih, 0.28, (it[i].seed || i + 1) * 3);
      s.addImage({ data: img, x, y: top, w: cw, h: ih });
      s.addText(it[i].caption || '', { x, y: top + ih + 0.15, w: cw, h: 0.5, fontFace: F.body, fontSize: 15, bold: true, color: p.text, margin: 0, valign: 'top', isTextBox: true });
    }
    footer(s, p, n);
    return s;
  }

  /** Фінал. o:{title,subtitle,contacts:[{icon,text}]} */
  async function closing(o) {
    const { s, p } = await newSlide('hero', 'hero', o.notes);
    s.addText(rich(o.title, { fontFace: F.head, fontSize: 56, bold: true, color: p.text }, p.hl), { x: 0.9, y: 1.4, w: 9.5, h: 2.6, valign: 'bottom', margin: 0, isTextBox: true });
    if (o.subtitle) s.addText(o.subtitle, { x: 0.9, y: 4.2, w: 8.5, h: 0.9, fontFace: F.body, fontSize: 20, color: p.muted, valign: 'top', margin: 0, isTextBox: true });
    const cs = o.contacts || []; let x = 0.9;
    for (const c of cs) {
      const w = 0.9 + String(c.text).length * 0.13;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.6, w, h: 0.62, rectRadius: 0.31, fill: { color: 'FFFFFF', transparency: 88 }, line: { color: 'FFFFFF', width: 0.75, transparency: 75 } });
      s.addImage({ data: await icon(c.icon || 'Mail', p.hl), x: x + 0.22, y: 5.6 + 0.16, w: 0.3, h: 0.3 });
      s.addText(c.text, { x: x + 0.65, y: 5.6, w: w - 0.8, h: 0.62, fontFace: F.body, fontSize: 15, color: p.text, valign: 'middle', margin: 0, isTextBox: true });
      x += w + 0.25;
    }
    return s;
  }

  return { pres, theme, title, agenda, section, statement, cards, stats, split, timeline, compare, chart, table, quote, gallery, closing, save: (f) => pres.writeFile({ fileName: f }) };
}

module.exports = { createKit, THEMES, icon, artImage, roundedPhoto, meshBackground };
