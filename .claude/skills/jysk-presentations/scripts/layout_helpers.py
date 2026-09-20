#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reusable "designer-quality" slide builders, reverse-engineered (colors
sampled from real pixels, not guessed) from five reference screenshots
Adam sent — see assets/layout_examples/. These are custom full-canvas
slides, NOT the official JYSK PowerPoint layouts/placeholders — use them
for town-hall / KPI-story decks where a plain Standard-slide table would
look flat. For a deck built from the official templates, the Official
formatting rules in SKILL.md (Verdana, #565655 body text, mandated
sizes) still apply to any placeholder text; these helpers govern their
own custom canvases instead.

Palette (sampled from the reference images — a deeper/richer set than
the official theme's accent1-6, used for emphasis on these richer
layouts):
    HERO_NAVY    #0B2E5C  sidebar / banner / overlay-card fills
    HEADLINE_NAVY#003B72  bold headlines, big numbers, row numerals
    ACCENT_BLUE  #2E6BE0  chart bars, links
    CHECK_NAVY   #034A90  checkmarks / icons (== theme accent6)
    LIGHT_BLUE_BG#EAF1FB  stat-card fill, "before" pill fill
    SUCCESS_FILL #E7F3EC  "improved" pill fill
    SUCCESS_TEXT #4C9A6E  "improved" pill/delta text
    WARN_FILL    #FBEAE5  "worsened" pill fill / stat-number accent
    WARN_TEXT    #E06A4E  "worsened" pill/delta text, attention numbers
    NEUTRAL_FILL #EDEFF2  "unchanged" pill fill
    BODY_GRAY    #565655  secondary/description text (matches official
                          dk1/dk2 — still the right color for body copy
                          even on these custom canvases)
    WHITE        #FFFFFF

Requires: python-pptx. All coordinates in EMU (Emu(...)); slide is
assumed 16:9 12192000 x 6858000 (the JYSK template's own size) unless
you pass a Presentation with different dimensions.
"""
from pptx.util import Emu, Pt, Inches
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

FONT = "Verdana"

HERO_NAVY = RGBColor(0x0B, 0x2E, 0x5C)
HEADLINE_NAVY = RGBColor(0x00, 0x3B, 0x72)
ACCENT_BLUE = RGBColor(0x2E, 0x6B, 0xE0)
CHECK_NAVY = RGBColor(0x03, 0x4A, 0x90)
LIGHT_BLUE_BG = RGBColor(0xEA, 0xF1, 0xFB)
SUCCESS_FILL = RGBColor(0xE7, 0xF3, 0xEC)
SUCCESS_TEXT = RGBColor(0x4C, 0x9A, 0x6E)
WARN_FILL = RGBColor(0xFB, 0xEA, 0xE5)
WARN_TEXT = RGBColor(0xE0, 0x6A, 0x4E)
NEUTRAL_FILL = RGBColor(0xED, 0xEF, 0xF2)
NEUTRAL_TEXT = RGBColor(0x8A, 0x8F, 0x99)
BODY_GRAY = RGBColor(0x56, 0x56, 0x55)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LINE_GRAY = RGBColor(0xE2, 0xE5, 0xEA)

SLIDE_W = Emu(12192000)
SLIDE_H = Emu(6858000)


def _run(r, text, size, bold=False, italic=False, color=BODY_GRAY, font=FONT):
    r.text = text
    r.font.name = font
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return r


def _textbox(slide, left, top, width, height, anchor=None, word_wrap=True):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = word_wrap
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    if anchor:
        tf.vertical_anchor = anchor
    return box, tf


def _rect(slide, left, top, width, height, fill=None, line=False, rounded=False, radius=0.08):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
    shp = slide.shapes.add_shape(shape_type, left, top, width, height)
    if rounded:
        try:
            shp.adjustments[0] = radius
        except (IndexError, AttributeError):
            pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line:
        shp.line.color.rgb = line if isinstance(line, RGBColor) else LINE_GRAY
        shp.line.width = Pt(0.75)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def _set_fill_alpha(shape, alpha_pct):
    """python-pptx has no public API for fill transparency — poke the
    XML directly. alpha_pct: 0-100, where 100 is fully opaque (matches
    how PowerPoint's own UI labels 'Transparency' inverted — pass e.g.
    55 for a fill that's 55% opaque / 45% see-through)."""
    sp = shape.fill.fore_color._xFill
    srgb = sp.find(qn('a:srgbClr'))
    if srgb is None:
        return
    for child in list(srgb):
        srgb.remove(child)
    alpha = srgb.makeelement(qn('a:alpha'), {'val': str(int(alpha_pct * 1000))})
    srgb.append(alpha)


def _eyebrow(slide, text, left, top, width, color=ACCENT_BLUE, size=12, align=PP_ALIGN.LEFT):
    box, tf = _textbox(slide, left, top, width, Emu(300000))
    p = tf.paragraphs[0]
    p.alignment = align
    _run(p.add_run(), text.upper(), size, bold=True, color=color)
    return box


def _headline(slide, text, left, top, width, color=HEADLINE_NAVY, size=28, align=PP_ALIGN.LEFT):
    box, tf = _textbox(slide, left, top, width, Emu(700000))
    p = tf.paragraphs[0]
    p.alignment = align
    _run(p.add_run(), text, size, bold=True, color=color)
    return box


def blank_slide(prs, layout_idx=None):
    """Add a slide with no placeholders — use the presentation's Empty
    layout if you know its index, else pass any layout and this still
    works since these helpers never touch inherited placeholders."""
    layout = prs.slide_layouts[layout_idx] if layout_idx is not None else prs.slide_layouts[0]
    return prs.slides.add_slide(layout)


# ---------------------------------------------------------------------
# 1. Sidebar + numbered checklist  (assets/layout_examples/example_sidebar_checklist.png)
# ---------------------------------------------------------------------
def add_sidebar_checklist_slide(slide, sidebar_eyebrow, big_number, sidebar_title,
                                 sidebar_body, sidebar_caption,
                                 content_eyebrow, headline, rows, footer_statement=None,
                                 sidebar_width=Emu(3400000),
                                 col1_header="ФОКУС ТА ДОСЯГНУТИЙ ЕФЕКТ", col2_header="ПІДСУМОК"):
    """rows: list of (number_str, title, description, done: bool). The
    reference image was a 'here's what we did' recap, hence the default
    column headers — override col1_header/col2_header for other uses
    (e.g. a forward-looking action-item list: col2_header="" since a
    not-yet-done item has no ✓ to summarize)."""
    _rect(slide, Emu(0), Emu(0), sidebar_width, SLIDE_H, fill=HERO_NAVY)

    pad = Emu(420000)
    _eyebrow(slide, sidebar_eyebrow, pad, Emu(430000), sidebar_width - 2 * pad,
             color=RGBColor(0x9D, 0xC3, 0xEE))
    box, tf = _textbox(slide, pad, Emu(780000), sidebar_width - 2 * pad, Emu(1400000))
    _run(tf.paragraphs[0].add_run(), big_number, 72, bold=True, color=WHITE)

    box, tf = _textbox(slide, pad, Emu(2250000), sidebar_width - 2 * pad, Emu(900000))
    tf.paragraphs[0].line_spacing = 1.1
    _run(tf.paragraphs[0].add_run(), sidebar_title, 20, bold=True, color=WHITE)

    box, tf = _textbox(slide, pad, Emu(3150000), sidebar_width - 2 * pad, Emu(1200000))
    tf.paragraphs[0].line_spacing = 1.3
    _run(tf.paragraphs[0].add_run(), sidebar_body, 13, color=RGBColor(0xC7, 0xD6, 0xE8))

    _rect(slide, pad, Emu(4650000), Emu(900000), Emu(18000), fill=ACCENT_BLUE)
    box, tf = _textbox(slide, pad, Emu(4800000), sidebar_width - 2 * pad, Emu(700000))
    tf.paragraphs[0].line_spacing = 1.2
    _run(tf.paragraphs[0].add_run(), sidebar_caption, 12, color=RGBColor(0xC7, 0xD6, 0xE8))

    content_left = sidebar_width + Emu(500000)
    content_w = SLIDE_W - content_left - Emu(500000)
    _eyebrow(slide, content_eyebrow, content_left, Emu(360000), content_w)
    _headline(slide, headline, content_left, Emu(640000), content_w, size=26)

    header_top = Emu(1550000)
    box, tf = _textbox(slide, content_left, header_top, Emu(content_w * 0.62), Emu(280000))
    _run(tf.paragraphs[0].add_run(), col1_header, 11, bold=True, color=NEUTRAL_TEXT)
    box, tf = _textbox(slide, content_left + Emu(int(content_w * 0.62)), header_top,
                        Emu(int(content_w * 0.38)), Emu(280000))
    tf.paragraphs[0].alignment = PP_ALIGN.RIGHT
    _run(tf.paragraphs[0].add_run(), col2_header, 11, bold=True, color=NEUTRAL_TEXT)
    _rect(slide, content_left, header_top + Emu(300000), content_w, Emu(12700), fill=LINE_GRAY)

    row_h = Emu(700000)
    row_top = header_top + Emu(420000)
    for i, (num, title, desc, done) in enumerate(rows):
        y = row_top + i * row_h
        if i > 0:
            _rect(slide, content_left, y, content_w, Emu(9500), fill=LINE_GRAY)
        box, tf = _textbox(slide, content_left, y + Emu(90000), Emu(650000), row_h)
        _run(tf.paragraphs[0].add_run(), num, 24, bold=True, color=HEADLINE_NAVY)
        tbox, ttf = _textbox(slide, content_left + Emu(700000), y + Emu(70000),
                              Emu(int(content_w * 0.62) - 700000), row_h)
        _run(ttf.paragraphs[0].add_run(), title, 15, bold=True, color=RGBColor(0x22, 0x22, 0x22))
        p2 = ttf.add_paragraph()
        p2.space_before = Pt(2)
        _run(p2.add_run(), desc, 12, color=BODY_GRAY)
        if done:
            cbox, ctf = _textbox(slide, content_left + Emu(int(content_w * 0.88)),
                                  y + Emu(150000), Emu(int(content_w * 0.12)), Emu(500000))
            ctf.paragraphs[0].alignment = PP_ALIGN.RIGHT
            _run(ctf.paragraphs[0].add_run(), "✓", 22, bold=True, color=CHECK_NAVY)

    if footer_statement:
        fy = row_top + len(rows) * row_h + Emu(150000)
        _rect(slide, content_left, fy - Emu(60000), content_w, Emu(9500), fill=LINE_GRAY)
        box, tf = _textbox(slide, content_left, fy + Emu(60000), content_w, Emu(500000))
        _run(tf.paragraphs[0].add_run(), footer_statement, 16, bold=True, color=RGBColor(0x22, 0x22, 0x22))


# ---------------------------------------------------------------------
# 2. KPI before/after pill comparison  (example_kpi_pill_comparison.png)
# ---------------------------------------------------------------------
def add_kpi_comparison_slide(slide, eyebrow, headline, rows):
    """rows: list of dicts {kpi, before, after, direction, delta, note}
    direction in {"up_good","up_bad","down_good","down_bad","flat"} —
    picks the pill/delta color; "up_bad"/"down_bad" use WARN, the
    "_good" variants use SUCCESS, "flat" uses NEUTRAL."""
    pad = Emu(500000)
    _eyebrow(slide, eyebrow, pad, Emu(360000), SLIDE_W - 2 * pad)
    _headline(slide, headline, pad, Emu(640000), SLIDE_W - 2 * pad, size=26)

    box, tf = _textbox(slide, pad, Emu(1500000), Emu(2500000), Emu(280000))
    _run(tf.paragraphs[0].add_run(), "KPI", 11, bold=True, color=NEUTRAL_TEXT)

    row_h = Emu(650000)
    top = Emu(1900000)
    kpi_w, before_w, arrow_w, after_w, delta_w = (
        Emu(3600000), Emu(1500000), Emu(500000), Emu(1500000), Emu(2800000))
    left0 = pad
    for i, row in enumerate(rows):
        y = top + i * row_h
        if i % 2 == 1:
            _rect(slide, pad, y, SLIDE_W - 2 * pad, row_h, fill=RGBColor(0xF7, 0xF8, 0xFA))
        box, tf = _textbox(slide, left0 + Emu(120000), y, kpi_w, row_h, anchor=MSO_ANCHOR.MIDDLE)
        _run(tf.paragraphs[0].add_run(), row["kpi"], 14, bold=True, color=RGBColor(0x22, 0x22, 0x22))

        fill_map = {"up_good": SUCCESS_FILL, "down_good": SUCCESS_FILL,
                    "up_bad": WARN_FILL, "down_bad": WARN_FILL, "flat": NEUTRAL_FILL}
        text_map = {"up_good": SUCCESS_TEXT, "down_good": SUCCESS_TEXT,
                    "up_bad": WARN_TEXT, "down_bad": WARN_TEXT, "flat": NEUTRAL_TEXT}
        direction = row.get("direction", "flat")

        bx = left0 + kpi_w + Emu(200000)
        pill = _rect(slide, bx, y + Emu(150000), before_w, Emu(360000), fill=LIGHT_BLUE_BG, rounded=True, radius=0.5)
        ptf = pill.text_frame
        ptf.word_wrap = False
        pp = ptf.paragraphs[0]
        pp.alignment = PP_ALIGN.CENTER
        _run(pp.add_run(), row["before"], 13, bold=True, color=HEADLINE_NAVY)

        ax = bx + before_w + Emu(50000)
        abox, atf = _textbox(slide, ax, y + Emu(150000), arrow_w, Emu(360000), anchor=MSO_ANCHOR.MIDDLE)
        atf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _run(atf.paragraphs[0].add_run(), "→", 16, color=NEUTRAL_TEXT)

        fx = ax + arrow_w + Emu(50000)
        pill2 = _rect(slide, fx, y + Emu(150000), after_w, Emu(360000),
                       fill=fill_map[direction], rounded=True, radius=0.5)
        p2tf = pill2.text_frame
        p2tf.word_wrap = False
        p2p = p2tf.paragraphs[0]
        p2p.alignment = PP_ALIGN.CENTER
        _run(p2p.add_run(), row["after"], 13, bold=True, color=text_map[direction])

        dx = fx + after_w + Emu(150000)
        dbox, dtf = _textbox(slide, dx, y, delta_w, row_h, anchor=MSO_ANCHOR.MIDDLE)
        dp = dtf.paragraphs[0]
        _run(dp.add_run(), row.get("delta", ""), 13, bold=True, color=text_map[direction])
        if row.get("note"):
            np_ = dtf.add_paragraph()
            np_.space_before = Pt(2)
            _run(np_.add_run(), row["note"], 11, italic=True, color=NEUTRAL_TEXT)
        if i < len(rows) - 1:
            pass  # zebra striping already separates rows; no extra divider needed


# ---------------------------------------------------------------------
# 3. Stat card + ranked bar chart (+ optional photo) + insight banner
#    (example_stat_bar_insight.png) — same recipe as jysk-dashboard-report
# ---------------------------------------------------------------------
def add_stat_bar_insight_slide(slide, eyebrow, headline, stat_number, stat_label,
                                intro_text, bars, insight_text, photo_path=None,
                                stat_color=WARN_TEXT, chart_top=None, banner_top=Emu(6150000)):
    """bars: list of (label, value) already sorted descending. Bar height/
    gap auto-shrink to fit whatever's between chart_top and banner_top —
    the 5-bar reference image's proportions hold up to ~6 bars; beyond
    that this keeps everything in bounds but gets visually dense, so for
    10+ rows prefer showing a top-N slice (with a '+N more' note) over
    cramming every row in, same as the ranked-list convention elsewhere
    in this skill."""
    pad = Emu(500000)
    _eyebrow(slide, eyebrow, pad, Emu(330000), SLIDE_W - 2 * pad)
    _headline(slide, headline, pad, Emu(600000), SLIDE_W - 2 * pad, size=24)

    card_w, card_h = Emu(2500000), Emu(1500000)
    _rect(slide, pad, Emu(1350000), card_w, card_h, fill=LIGHT_BLUE_BG, rounded=True, radius=0.08)
    box, tf = _textbox(slide, pad + Emu(250000), Emu(1450000), card_w - Emu(500000), Emu(300000))
    _run(tf.paragraphs[0].add_run(), stat_label, 11, bold=True, color=NEUTRAL_TEXT)
    box, tf = _textbox(slide, pad + Emu(250000), Emu(1700000), card_w - Emu(500000), Emu(900000))
    _run(tf.paragraphs[0].add_run(), stat_number, 44, bold=True, color=stat_color)

    intro_left = pad + card_w + Emu(300000)
    box, tf = _textbox(slide, intro_left, Emu(1450000), SLIDE_W - intro_left - pad, card_h)
    tf.paragraphs[0].line_spacing = 1.3
    _run(tf.paragraphs[0].add_run(), intro_text, 14, italic=True, color=BODY_GRAY)

    if chart_top is None:
        chart_top = Emu(3150000)
    chart_w = Emu(7300000) if photo_path else (SLIDE_W - 2 * pad)
    max_val = max(v for _, v in bars) or 1
    n = max(len(bars), 1)
    available_h = banner_top - chart_top - Emu(150000)
    bar_h = Emu(320000)
    gap = Emu(120000)
    needed = bar_h * n + gap * (n - 1) if n > 1 else bar_h
    if needed > available_h:
        scale = available_h / needed
        bar_h = Emu(max(int(bar_h * scale), 140000))
        gap = Emu(max(int(gap * scale), 40000))
    label_w = Emu(1700000)
    track_left = pad + label_w
    track_w = chart_w - label_w - Emu(700000)
    for i, (label, value) in enumerate(bars):
        y = chart_top + i * (bar_h + gap)
        box, tf = _textbox(slide, pad, y, label_w - Emu(80000), bar_h, anchor=MSO_ANCHOR.MIDDLE)
        _run(tf.paragraphs[0].add_run(), label, 12, color=RGBColor(0x33, 0x33, 0x33))
        _rect(slide, track_left, y, track_w, bar_h, fill=RGBColor(0xEC, 0xF0, 0xF7), rounded=True, radius=0.5)
        w = max(Emu(int(track_w * value / max_val)), Emu(60000))
        _rect(slide, track_left, y, w, bar_h, fill=ACCENT_BLUE, rounded=True, radius=0.5)
        vbox, vtf = _textbox(slide, track_left + track_w + Emu(60000), y, Emu(600000), bar_h,
                              anchor=MSO_ANCHOR.MIDDLE)
        _run(vtf.paragraphs[0].add_run(), str(value), 13, bold=True, color=HEADLINE_NAVY)

    if photo_path:
        from PIL import Image
        with Image.open(photo_path) as im:
            iw, ih = im.size
        photo_left = pad + chart_w + Emu(250000)
        photo_w = SLIDE_W - photo_left - pad
        photo_h = Emu(int(photo_w * ih / iw))
        photo_top = chart_top
        slide.shapes.add_picture(photo_path, photo_left, photo_top, width=photo_w, height=photo_h)

    _rect(slide, pad, banner_top, SLIDE_W - 2 * pad, Emu(550000), fill=HERO_NAVY, rounded=True, radius=0.12)
    box, tf = _textbox(slide, pad + Emu(300000), banner_top, SLIDE_W - 2 * pad - Emu(600000), Emu(550000),
                        anchor=MSO_ANCHOR.MIDDLE)
    p = tf.paragraphs[0]
    _run(p.add_run(), "Головне: ", 14, bold=True, color=WHITE)
    _run(p.add_run(), insight_text, 14, color=RGBColor(0xE4, 0xEA, 0xF3))


# ---------------------------------------------------------------------
# 4. Full-bleed photo statement  (example_photo_statement.webp)
# ---------------------------------------------------------------------
def add_photo_statement_slide(slide, title, statement_lines, photo_path=None):
    """statement_lines: list of (text, bold) paragraphs inside the overlay card."""
    if photo_path:
        slide.shapes.add_picture(photo_path, Emu(0), Emu(0), width=SLIDE_W, height=SLIDE_H)
        overlay = _rect(slide, Emu(0), Emu(0), SLIDE_W, SLIDE_H, fill=RGBColor(0x06, 0x1A, 0x33))
        _set_fill_alpha(overlay, 55)  # 55% opaque navy veil so the photo still reads through
    else:
        _rect(slide, Emu(0), Emu(0), SLIDE_W, SLIDE_H, fill=HERO_NAVY)

    box, tf = _textbox(slide, Emu(500000), Emu(450000), Emu(8000000), Emu(700000))
    _run(tf.paragraphs[0].add_run(), title, 28, bold=True, color=WHITE)

    card_left, card_top = Emu(1600000), Emu(2400000)
    card_w, card_h = Emu(9000000), Emu(2000000)
    card = _rect(slide, card_left, card_top, card_w, card_h, fill=HERO_NAVY, rounded=True, radius=0.06)
    if photo_path:
        _set_fill_alpha(card, 80)
    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Emu(350000)
    tf.margin_top = tf.margin_bottom = Emu(250000)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    first = True
    for text, bold in statement_lines:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(10)
        _run(p.add_run(), text, 18, bold=bold, color=WHITE)


# ---------------------------------------------------------------------
# 5. Photo background + diagram/screenshot card + terms card + banner
#    (example_photo_diagram_banner.png)
# ---------------------------------------------------------------------
def add_photo_diagram_card_slide(slide, title, card_title, diagram_image_path,
                                  side_title, side_body, banner_text, photo_path=None):
    """diagram_image_path: a real screenshot/diagram to embed as-is (don't
    redraw an org chart or similar as shapes — place the actual image,
    same principle as the badges/icons captured elsewhere in this skill).
    """
    if photo_path:
        slide.shapes.add_picture(photo_path, Emu(0), Emu(0), width=SLIDE_W, height=SLIDE_H)
        veil = _rect(slide, Emu(0), Emu(0), SLIDE_W, SLIDE_H, fill=WHITE)
        _set_fill_alpha(veil, 35)
    else:
        _rect(slide, Emu(0), Emu(0), SLIDE_W, SLIDE_H, fill=RGBColor(0xF4, 0xF6, 0xF9))

    box, tf = _textbox(slide, Emu(500000), Emu(350000), Emu(6000000), Emu(600000))
    _run(tf.paragraphs[0].add_run(), title, 26, bold=True, color=RGBColor(0x22, 0x22, 0x22))

    card_left, card_top = Emu(950000), Emu(1150000)
    card_w, card_h = Emu(6900000), Emu(4600000)
    card = _rect(slide, card_left, card_top, card_w, card_h, fill=RGBColor(0xE8, 0xEA, 0xED), rounded=True, radius=0.03)
    _set_fill_alpha(card, 92)
    box, tf = _textbox(slide, card_left + Emu(250000), card_top + Emu(200000),
                        card_w - Emu(500000), Emu(350000))
    _run(tf.paragraphs[0].add_run(), card_title.upper(), 13, bold=True, color=HEADLINE_NAVY)

    if diagram_image_path:
        from PIL import Image
        with Image.open(diagram_image_path) as im:
            iw, ih = im.size
        avail_w = card_w - Emu(500000)
        avail_h = card_h - Emu(750000)
        scale = min(avail_w / iw, avail_h / ih)
        dw, dh = Emu(int(iw * scale)), Emu(int(ih * scale))
        slide.shapes.add_picture(diagram_image_path,
                                  card_left + (card_w - dw) // 2,
                                  card_top + Emu(650000),
                                  width=dw, height=dh)

    side_left = card_left + card_w + Emu(300000)
    side_w = SLIDE_W - side_left - Emu(500000)
    side = _rect(slide, side_left, card_top, side_w, Emu(1900000), fill=HERO_NAVY, rounded=True, radius=0.05)
    box, tf = _textbox(slide, side_left + Emu(250000), card_top + Emu(200000), side_w - Emu(500000), Emu(350000))
    _run(tf.paragraphs[0].add_run(), side_title.upper(), 13, bold=True, color=WHITE)
    box, tf = _textbox(slide, side_left + Emu(250000), card_top + Emu(600000), side_w - Emu(500000),
                        Emu(1200000))
    tf.paragraphs[0].line_spacing = 1.3
    _run(tf.paragraphs[0].add_run(), side_body, 14, color=RGBColor(0xE4, 0xEA, 0xF3))

    banner_top = Emu(6150000)
    _rect(slide, Emu(0), banner_top, SLIDE_W, Emu(708000), fill=HERO_NAVY)
    box, tf = _textbox(slide, Emu(700000), banner_top, SLIDE_W - Emu(1400000), Emu(708000),
                        anchor=MSO_ANCHOR.MIDDLE)
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER
    _run(tf.paragraphs[0].add_run(), banner_text, 18, bold=True, color=WHITE)
