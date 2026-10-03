#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the conditional-formatting pivot tables JYSK's SAP BW "District
Manager Follow up" export macro pastes into PowerPoint — reverse-engineered
from three of Adam's own real reference decks (unzipped and read the
actual table cell XML/fills directly, not guessed): Verdana 8pt, light-blue
label columns, a green/red threshold fill on every index(%) column. This
is the correct visual language for any deck built from a JYSK SAP
BW/RSPE export (Sales, Sales by product area, Productivity, Stock Adj.,
etc.) — NOT a native pptx chart, NOT a big-number stat card. Those remain
fine for other kinds of decks (see SKILL.md); this module is specifically
for replicating the pivot-table-paste look real JYSK managers already
expect.

Requires: python-pptx.
"""
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

FONT = "Verdana"
LABEL_FILL = RGBColor(0xC3, 0xD6, 0xEB)   # site code / name columns
HEADER_FILL = RGBColor(0xDB, 0xE5, 0xF1)  # header row
GOOD_FILL = RGBColor(0xAB, 0xED, 0xA5)    # index >= 100
BAD_FILL = RGBColor(0xFF, 0x98, 0x8C)     # index < 100
BLACK = RGBColor(0x00, 0x00, 0x00)


def fmt(v, dec=1):
    """JYSK's own number format: space thousands separator, comma decimal,
    em-dash for missing data (never a fabricated 0)."""
    if v is None:
        return "—"
    return f"{v:,.{dec}f}".replace(",", " ").replace(".", ",")


def pct_fill(v):
    """The one real rule found in all three reference decks: >=100 green,
    <100 red. A factual threshold against plan/prior-year, not a verdict —
    state it, don't editorialize on top of it."""
    if v is None:
        return None
    return GOOD_FILL if v >= 100 else BAD_FILL


def set_cell(cell, text, font_size=8, bold=False, fill=None, align=PP_ALIGN.CENTER, color=BLACK):
    cell.margin_left = Emu(36000)
    cell.margin_right = Emu(36000)
    cell.margin_top = Emu(18000)
    cell.margin_bottom = Emu(18000)
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    if fill is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill
    else:
        cell.fill.background()
    tf = cell.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = Pt(font_size)
    r.font.bold = bold
    r.font.color.rgb = color


def add_pivot_table(slide, left, top, width, height, headers, rows, col_types,
                     col_widths=None, label_cols=2):
    """headers: list of column header strings (len == n_cols).
    rows: list of row tuples, each len == n_cols, values already numbers
    or strings for label columns.
    col_types: list, one per column, in {'label', 'num', 'pct', 'raw'} —
    'label' -> LABEL_FILL + left-aligned text, 'num' -> no fill, centered,
    formatted via fmt(), 'pct' -> pct_fill() conditional color, centered,
    formatted via fmt(), 'raw' -> centered, printed as str(v) with no
    fmt() number-formatting (for a rank position, a code, or any column
    that's already exactly the display text you want).
    label_cols: how many leading columns are plain label text (site code,
    name) vs. the rest being data — used only if col_types doesn't already
    mark them, for convenience when every table starts with code+name.
    Returns the added table (python-pptx GraphicFrame).
    """
    n_rows = len(rows) + 1
    n_cols = len(headers)
    gshape = slide.shapes.add_table(n_rows, n_cols, left, top, width, height)
    tbl = gshape.table
    if col_widths:
        for i, w in enumerate(col_widths):
            tbl.columns[i].width = w

    for j, h in enumerate(headers):
        set_cell(tbl.cell(0, j), h, font_size=8, bold=True, fill=HEADER_FILL)

    for ri, row in enumerate(rows, start=1):
        bold = bool(row[-1]) if isinstance(row[-1], bool) else False
        values = row[:-1] if isinstance(row[-1], bool) else row
        for j, v in enumerate(values):
            ctype = col_types[j]
            if ctype == 'label':
                set_cell(tbl.cell(ri, j), str(v), bold=bold, fill=LABEL_FILL, align=PP_ALIGN.LEFT)
            elif ctype == 'pct':
                set_cell(tbl.cell(ri, j), fmt(v), bold=bold, fill=pct_fill(v), align=PP_ALIGN.CENTER)
            elif ctype == 'raw':
                set_cell(tbl.cell(ri, j), str(v), bold=bold, fill=None, align=PP_ALIGN.CENTER)
            else:  # 'num'
                set_cell(tbl.cell(ri, j), fmt(v), bold=bold, fill=None, align=PP_ALIGN.CENTER)
    return gshape
