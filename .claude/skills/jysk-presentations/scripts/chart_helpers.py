#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Native, editable pptx bar charts for leftover slide space next to an
OLE table (see ole_table_helpers.py) — pulled out of a one-off deck
build script into the skill because Adam asked for this pattern on
every slide with room to spare, not just one: "Якщо, наприклад, на
слайді праворуч залишається вільне місце, ти можеш використати
діаграму... Ну, на всіх діаграмах бажано використовувати сам показник і
індекс цього показника, якщо він є в тебе."

Two chart builders:
  add_ranked_chart — one series, one bar per store, colored good/bad by
    a threshold rule (see fy27_targets.py for which rule fits which
    metric), with an optional companion number (the metric's own index
    or %) folded into each bar's data label.
  add_group_chart  — several series side by side (e.g. two product
    groups across the same stores) for straight comparison, not a
    good/bad call — so series get fixed distinguishing colors instead
    of threshold colors.
"""
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

NAVY = RGBColor(0x14, 0x3C, 0x8A)
RED = RGBColor(0xE3, 0x06, 0x13)
GRAY = RGBColor(0xCC, 0xCC, 0xCC)
AMBER = RGBColor(0xF5, 0x9E, 0x0B)  # second series in a group-comparison chart


def add_ranked_chart(slide, left, top, width, height, title, categories, values,
                      companions=None, color_rule="growth", target=100.0,
                      value_fmt="{:,.0f}", companion_fmt="{:.0f}%", font="Verdana"):
    """`values` sets bar height and is always the metric on its own real
    scale (revenue, грн/год, %) — never a bare index standing in for it,
    so stores compare on a scale a reader actually recognizes.
    `companions`, if given, is a list the same length as `values` with
    that metric's own index/% (None entries allowed, e.g. a new store
    with no prior-year comparison) — folded into the data label next to
    the raw value instead of forcing a pick between the two numbers.

    color_rule (what counts as "good" — see fy27_targets.py for the real
    FY27 numbers behind "floor"/"ceiling"/"stock_adj"):
      "growth"    — green if (companions[i] if a companions list was
                    passed, else values[i]) >= 100. Plain >=100 growth/
                    plan-achievement threshold, no FY27 annual goal
                    involved. A None entry in `companions` colors gray
                    (unknown) — it is NEVER silently replaced by the raw
                    value, which would miscolor e.g. a revenue number
                    against the 100 baseline.
      "floor"     — green if values[i] >= target (bigger is better, e.g.
                    productivity грн/год vs the FY27 goal of 3250).
      "ceiling"   — green if values[i] <= target (smaller is better, e.g.
                    staff turnover / sick absence vs their FY27 cap).
      "stock_adj" — green if values[i] >= target, where target is itself
                    negative (FY27 stock-adjustment goal is -0.25%, a
                    small write-off is expected — 0 is NOT the threshold).
      None        — no threshold coloring, flat navy.
    """
    chart_data = CategoryChartData()
    chart_data.categories = categories
    chart_data.add_series(title, values)
    gframe = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, left, top, width, height, chart_data)
    chart = gframe.chart
    chart.has_legend = False
    chart.has_title = True
    chart.chart_title.text_frame.text = title
    for r in chart.chart_title.text_frame.paragraphs[0].runs:
        r.font.size = Pt(11)
        r.font.name = font
        r.font.bold = True
    plot = chart.plots[0]
    plot.gap_width = 40
    plot.has_data_labels = True
    series = plot.series[0]
    for i, pt in enumerate(series.points):
        v = values[i]
        comp = companions[i] if companions is not None else None
        pt.format.fill.solid()
        if v is None:
            pt.format.fill.fore_color.rgb = GRAY
        elif color_rule == "growth":
            basis = comp if companions is not None else v
            pt.format.fill.fore_color.rgb = GRAY if basis is None else (NAVY if basis >= 100 else RED)
        elif color_rule == "floor":
            pt.format.fill.fore_color.rgb = NAVY if v >= target else RED
        elif color_rule == "ceiling":
            pt.format.fill.fore_color.rgb = NAVY if v <= target else RED
        elif color_rule == "stock_adj":
            pt.format.fill.fore_color.rgb = NAVY if v >= target else RED
        else:
            pt.format.fill.fore_color.rgb = NAVY
        dl = pt.data_label
        dl.has_text_frame = True
        if v is None:
            dl.text_frame.text = "—"
        elif comp is not None:
            dl.text_frame.text = f"{value_fmt.format(v)} ({companion_fmt.format(comp)})"
        else:
            dl.text_frame.text = value_fmt.format(v)
        for run in dl.text_frame.paragraphs[0].runs:
            run.font.size = Pt(9)
            run.font.name = font
    chart.category_axis.tick_labels.font.size = Pt(9)
    chart.category_axis.tick_labels.font.name = font
    chart.value_axis.visible = False
    chart.value_axis.has_major_gridlines = False
    return gframe


def add_group_chart(slide, left, top, width, height, title, categories, series, font="Verdana"):
    """Multi-series clustered bar chart for comparing several categories
    side by side on one chart (e.g. two product-area index series across
    the same stores) — unlike add_ranked_chart this isn't a single
    good/bad-per-bar call, so series get fixed distinguishing colors
    instead of threshold colors. series: list of (name, values) tuples,
    each `values` the same length as `categories`."""
    chart_data = CategoryChartData()
    chart_data.categories = categories
    for name, values in series:
        chart_data.add_series(name, values)
    gframe = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, left, top, width, height, chart_data)
    chart = gframe.chart
    chart.has_legend = True
    chart.has_title = True
    chart.chart_title.text_frame.text = title
    for r in chart.chart_title.text_frame.paragraphs[0].runs:
        r.font.size = Pt(11)
        r.font.name = font
        r.font.bold = True
    chart.legend.include_in_layout = False
    chart.legend.font.size = Pt(9)
    chart.legend.font.name = font
    plot = chart.plots[0]
    plot.gap_width = 60
    plot.overlap = -10
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.number_format = '0.0'
    dl.number_format_is_linked = False
    dl.font.size = Pt(8)
    dl.font.name = font
    colors = [NAVY, AMBER]
    for s_idx, s in enumerate(plot.series):
        s.format.fill.solid()
        s.format.fill.fore_color.rgb = colors[s_idx % len(colors)]
    chart.category_axis.tick_labels.font.size = Pt(9)
    chart.category_axis.tick_labels.font.name = font
    chart.value_axis.visible = False
    chart.value_axis.has_major_gridlines = False
    return gframe
