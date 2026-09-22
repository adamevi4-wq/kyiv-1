# Generic presentation-planning prompts (tool-agnostic)

Four prompt templates Adam collected (from Gemini) — unlike
`scripts/MASTER_PROMPT.md`, these don't reference `deck-kit.js` at all;
they're general-purpose prompts for getting a presentation *plan* or
*outline* out of any chat AI, not JYSK-specific. Keep them verbatim; use
as a starting point/inspiration when a request doesn't fit the
deck-kit/official-template path cleanly, or when Adam wants a plan
reviewed before any file gets built.

## 1. Plan only, Ukrainian (Presentation Designer + Content Strategist)
Asks for: slide-by-slide plan (title ≤5 words, bullet theses only, a
concrete visual description per slide incl. layout — "text left / chart
right" style, speaker notes 2-3 sentences), plus a recommended color
palette (3-4 HEX) and font pairing. No file output — a plan to review
first.

```
Роль: Ти досвідчений Presentation Designer та Content Strategist.
Завдання: Створи структурований, сучасний та візуально привабливий план презентації PowerPoint на тему: "[ВКАЖІТЬ ТЕМУ]".

Цільова аудиторія: [наприклад: інвестори / клієнти / колеги]
Тон: [професійний / натхненний / лаконічний / сучасний]
Кількість слайдів: [наприклад: 8-10]

Вимоги до оформлення кожного слайда:
1. Заголовок слайда: Лаконічний та змістовний (до 5 слів).
2. Текстовий контент: Тільки головні тези (bullet points), без великих масивів тексту.
3. Дизайн та візуальне рішення:
   - Конкретний опис візуалу (які фотографії, іконки, діаграми або схеми використовувати).
   - Компоновка (layout): де розташований текст, де візуал (наприклад: ліва колонка — текст, права — діаграма).
4. Нотатки спикера (Speaker Notes): 2-3 речення для виступу.

Додатково надай рекомендації щодо стилю:
- Колірна палітра (HEX-коди 3-4 основних кольорів).
- Шрифтова пара (заголовок + основний текст, які є в стандартних шрифтах Google Fonts або MS Office).
```

## 2. Executive/VC deck, English — outline-first, research-driven
Distinctive features worth reusing elsewhere: explicitly asks the AI to
**research current market stats/facts** rather than invent them, and to
**generate the outline first** for review before building anything
further — a good pattern for any high-stakes deck, not just VC pitches.

```
Act as an Executive Presentation Designer & Strategy Consultant.
Create a comprehensive presentation deck about: [ВКАЖІТЬ ТЕМУ або ПРОДУКТ].

Target Audience: [наприклад: VCs / C-level executives / Clients / Students]
Tone & Style: Professional, persuasive, clean, modern.
Target Slide Count: [наприклад: 10-12 slides]

Requirements for Content & Structure:
1. Conduct real-time research on current market statistics, facts, and key data related to the topic.
2. Structure: Start with an Executive Summary/Problem, detail the Solution/Data/Strategy, and end with Next Steps/CTA.
3. Slide Layout:
   - Use clear bullet points (max 3-4 per slide).
   - Generate editable data charts (bar/line/pie) where numerical stats are present.
   - Include speaker notes for each slide.
4. Visual Direction: Use a modern color theme with high-contrast text and clean business visuals.

Please generate the Outline first so I can review the slide titles.
```

## 3. Document/text → deck conversion
Use when Adam has an existing report, meeting notes, or a data dump he
wants turned into slides rather than a deck built from a topic brief.
Key instruction worth keeping: **preserve every stat/citation from the
source strictly** — don't let the summarization step drop or round
real numbers.

```
Transform the attached document / pasted text into a structured PowerPoint presentation deck.

Key Instructions:
- Filter out fluff; extract only core findings, KPIs, action items, and strategic decisions.
- Group the information logically (e.g., Problem -> Data & Insights -> Recommendations -> Action Items).
- Convert complex paragraphs into comparison tables, step-by-step processes, or bullet points.
- Ensure all statistics and citations from the text are strictly preserved.
- Keep the deck concise (around 8-10 slides).
```

## 4. Classic 10-slide VC pitch deck structure
Not directly relevant to Adam's own work (he's a district manager, not
fundraising), but a solid reference **outline** if a startup-style
structured pitch is ever needed for something analogous (e.g. pitching
a new district-level initiative internally): Title/Value Prop → Problem
→ Solution → Market Size (TAM/SAM/SOM) → Business Model → Traction/
Metrics → Competitive Advantage → GTM Strategy → Team/Roadmap → The Ask.

```
Create a classic 10-slide Venture Capital Pitch Deck for a startup called "[НАЗВА СТАРТАПУ]".
What we do: [КОРОТКИЙ ОПИС ПРОДУКТУ/ПОСЛУГИ].

Include slides for:
1. Title & Value Proposition
2. Problem (Market pain points with recent data)
3. Solution & Product Overview
4. Market Size (TAM, SAM, SOM)
5. Business Model & Revenue
6. Traction & Key Metrics (include a growth chart placeholder)
7. Competitive Advantage
8. Go-To-Market Strategy
9. Team & Roadmap
10. The Ask (Funding requirements & allocation)

Design Note: Minimalist, tech-focused visual style. Use real industry data for the market size slide.
```
