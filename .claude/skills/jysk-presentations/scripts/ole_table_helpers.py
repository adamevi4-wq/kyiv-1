#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generalized version of the OLE-embedded-Excel-table pilot: build a
real, double-click-editable Excel worksheet (not a static pptx table)
for a slide, using python-pptx's own public add_ole_object API (tested
code path, not hand-rolled OOXML) plus openpyxl for the embedded
workbook with REAL conditional-formatting rules, and a PIL-rendered
preview image matching JYSK's confirmed look (Verdana, light-blue label
columns, green/red >=100 threshold on index columns)."""
import io
from pptx.util import Emu
from pptx.enum.shapes import PROG_ID
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
from PIL import Image, ImageDraw, ImageFont

LABEL_FILL = "C3D6EB"
HEADER_FILL = "DBE5F1"
GOOD_FILL = "ABEDA5"
BAD_FILL = "FF988C"

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _col_letter(idx):
    """1-based column index -> Excel column letter."""
    s = ""
    while idx > 0:
        idx, r = divmod(idx - 1, 26)
        s = chr(65 + r) + s
    return s


def build_xlsx_bytes(sheet_name, headers, rows, col_types):
    """rows: list of tuples, each len(headers) values + trailing bool
    (bold, e.g. for a district/network total row). col_types: 'label'/
    'num'/'pct' per column, same convention as pivot_table_helpers.py."""
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]

    thin = Side(style="thin", color="B9C6D6")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    for j, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=j, value=h)
        c.font = Font(name="Verdana", size=8, bold=True)
        c.fill = PatternFill("solid", fgColor=HEADER_FILL)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
    ws.row_dimensions[1].height = 40

    pct_cols = [j for j, t in enumerate(col_types, start=1) if t == "pct"]
    for i, row in enumerate(rows, start=2):
        is_bold = bool(row[-1]) if isinstance(row[-1], bool) else False
        values = row[:-1] if isinstance(row[-1], bool) else row
        for j, v in enumerate(values, start=1):
            c = ws.cell(row=i, column=j, value=v if v is not None else None)
            c.font = Font(name="Verdana", size=8, bold=is_bold)
            c.border = border
            ctype = col_types[j - 1]
            if ctype == "label":
                c.fill = PatternFill("solid", fgColor=LABEL_FILL)
                c.alignment = Alignment(horizontal="left", vertical="center")
            else:
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.number_format = "0.0" if ctype == "pct" else "#,##0.0"

    last_row = len(rows) + 1
    green_fill = PatternFill("solid", fgColor=GOOD_FILL)
    red_fill = PatternFill("solid", fgColor=BAD_FILL)
    for j in pct_cols:
        col = _col_letter(j)
        rng = f"{col}2:{col}{last_row}"
        ws.conditional_formatting.add(rng, CellIsRule(operator="greaterThanOrEqual", formula=["100"], fill=green_fill))
        ws.conditional_formatting.add(rng, CellIsRule(operator="lessThan", formula=["100"], fill=red_fill))

    for j, t in enumerate(col_types, start=1):
        width = 22 if t == "label" and j == 2 else (10 if t == "label" else 13)
        ws.column_dimensions[_col_letter(j)].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def build_preview_png(path, headers, rows, col_types, col_w_px):
    """Raster 'closed state' snapshot shown on the slide until
    double-clicked. col_w_px: list of column widths in px (pre-scale)."""
    scale = 3
    row_h = 46
    header_h = 70
    W = sum(col_w_px) * scale
    H = (header_h + row_h * len(rows)) * scale
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)
    f_head = ImageFont.truetype(FONT_BOLD, 12 * scale)
    f_cell = ImageFont.truetype(FONT_PATH, 13 * scale)
    f_cell_b = ImageFont.truetype(FONT_BOLD, 13 * scale)

    def hexrgb(h):
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

    def wrap_to_width(text, font, max_w):
        lines = []
        for para in text.split("\n"):
            words = para.split(" ")
            cur = ""
            for w in words:
                trial = (cur + " " + w).strip()
                if draw.textbbox((0, 0), trial, font=font)[2] <= max_w or not cur:
                    cur = trial
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        return lines

    def fmt(v):
        if v is None:
            return "—"
        if isinstance(v, str):
            return v
        return f"{v:,.1f}".replace(",", " ")

    def draw_row(y, row, bold):
        x = 0
        values = row[:-1] if isinstance(row[-1], bool) else row
        for j, (w, val) in enumerate(zip(col_w_px, values)):
            wpx = w * scale
            ctype = col_types[j]
            fill = None
            if ctype == "label":
                fill = hexrgb(LABEL_FILL)
            elif ctype == "pct" and val is not None:
                try:
                    fill = hexrgb(GOOD_FILL if float(val) >= 100 else BAD_FILL)
                except (TypeError, ValueError):
                    fill = None
            if fill:
                draw.rectangle([x, y, x + wpx, y + row_h * scale], fill=fill)
            draw.rectangle([x, y, x + wpx, y + row_h * scale], outline=(185, 198, 214))
            text = fmt(val)
            fnt = f_cell_b if bold else f_cell
            max_text_w = wpx - 10 * scale
            if ctype == "label" and draw.textbbox((0, 0), text, font=fnt)[2] > max_text_w:
                fnt = ImageFont.truetype(FONT_BOLD if bold else FONT_PATH, 11 * scale)
                if draw.textbbox((0, 0), text, font=fnt)[2] > max_text_w:
                    fnt = ImageFont.truetype(FONT_BOLD if bold else FONT_PATH, 9 * scale)
            bbox = draw.textbbox((0, 0), text, font=fnt)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            tx = x + 8 * scale if ctype == "label" else x + (wpx - tw) / 2
            ty = y + (row_h * scale - th) / 2 - bbox[1]
            draw.text((tx, ty), text, fill=(20, 20, 20), font=fnt)
            x += wpx
        return y + row_h * scale

    x = 0
    for w, h in zip(col_w_px, headers):
        wpx = w * scale
        draw.rectangle([x, 0, x + wpx, header_h * scale], fill=hexrgb(HEADER_FILL), outline=(185, 198, 214))
        lines = wrap_to_width(h, f_head, wpx - 10 * scale)
        line_h = 15 * scale
        total_h = len(lines) * line_h
        start_y = (header_h * scale - total_h) / 2
        for li, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=f_head)
            tw = bbox[2] - bbox[0]
            draw.text((x + (wpx - tw) / 2, start_y + li * line_h), line, fill=(20, 20, 20), font=f_head)
        x += wpx

    y = header_h * scale
    for row in rows:
        bold = bool(row[-1]) if isinstance(row[-1], bool) else False
        y = draw_row(y, row, bold)

    img.save(path)
    return W, H


def add_ole_table(slide, left, top, width, height, sheet_name, headers, rows, col_types, col_w_px, png_path):
    """Build the embedded xlsx + preview PNG and place it as a real,
    double-click-editable Excel object on the slide."""
    xlsx_buf = build_xlsx_bytes(sheet_name, headers, rows, col_types)
    build_preview_png(png_path, headers, rows, col_types, col_w_px)
    gframe = slide.shapes.add_ole_object(
        object_file=xlsx_buf,
        prog_id=PROG_ID.XLSX,
        left=left, top=top, width=width, height=height,
        icon_file=png_path, icon_width=width, icon_height=height,
    )
    for ole in gframe._element.findall(
        './/{http://schemas.openxmlformats.org/presentationml/2006/main}oleObj'
    ):
        ole.attrib.pop('showAsIcon', None)
    return gframe
