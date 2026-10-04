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
from lxml import etree
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.oxml.ns import qn

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


def _inject_average_line(chart, categories, avg_value, line_color, avg_label):
    """Add a second plot — a flat dashed reference line at `avg_value`
    across every category — to an existing single-plot chart, sharing
    its axes. python-pptx has no API for a combo chart (two chart types
    in one plot area); this builds the <c:lineChart> XML by hand and
    splices it in next to the existing <c:barChart>, matching its axId
    pair so it shares the same axes rather than getting its own.
    IMPORTANT: this only renders sensibly for a COLUMN chart (vertical
    bars) — PowerPoint's own combo-chart picker doesn't even offer
    bar+line for horizontal bars, because a line chart has no concept of
    a horizontal category axis; use XL_CHART_TYPE.COLUMN_CLUSTERED, not
    BAR_CLUSTERED, on any chart this is applied to."""
    plot_area = chart._chartSpace.find(qn('c:chart')).find(qn('c:plotArea'))
    bar_chart = plot_area.find(qn('c:barChart'))
    ax_ids = [e.get('val') for e in bar_chart.findall(qn('c:axId'))]

    # Build via bar_chart.makeelement (not plain etree.Element) so every
    # node is created through python-pptx's own parser/class lookup —
    # a plain etree.Element here produces generic lxml elements with
    # none of python-pptx's CT_LineChart/.sers convenience properties,
    # which breaks `chart.plots[1]` the moment this is spliced in.
    line_chart = bar_chart.makeelement(qn('c:lineChart'), {})
    etree.SubElement(line_chart, qn('c:grouping')).set('val', 'standard')
    etree.SubElement(line_chart, qn('c:varyColors')).set('val', '0')
    ser = etree.SubElement(line_chart, qn('c:ser'))
    etree.SubElement(ser, qn('c:idx')).set('val', '1')
    etree.SubElement(ser, qn('c:order')).set('val', '1')
    tx = etree.SubElement(ser, qn('c:tx'))
    etree.SubElement(tx, qn('c:v')).text = avg_label
    spPr = etree.SubElement(ser, qn('c:spPr'))
    ln = etree.SubElement(spPr, qn('a:ln'))
    ln.set('w', '22225')
    solid_fill = etree.SubElement(ln, qn('a:solidFill'))
    etree.SubElement(solid_fill, qn('a:srgbClr')).set('val', str(line_color))
    etree.SubElement(ln, qn('a:prstDash')).set('val', 'dash')
    marker = etree.SubElement(ser, qn('c:marker'))
    etree.SubElement(marker, qn('c:symbol')).set('val', 'none')
    cat = etree.SubElement(ser, qn('c:cat'))
    str_ref = etree.SubElement(cat, qn('c:strRef'))
    etree.SubElement(str_ref, qn('c:f')).text = 'Sheet1!$A$2:$A$%d' % (len(categories) + 1)
    str_cache = etree.SubElement(str_ref, qn('c:strCache'))
    etree.SubElement(str_cache, qn('c:ptCount')).set('val', str(len(categories)))
    for i, c in enumerate(categories):
        pt = etree.SubElement(str_cache, qn('c:pt'))
        pt.set('idx', str(i))
        etree.SubElement(pt, qn('c:v')).text = c
    val = etree.SubElement(ser, qn('c:val'))
    num_ref = etree.SubElement(val, qn('c:numRef'))
    etree.SubElement(num_ref, qn('c:f')).text = 'Sheet1!$C$2:$C$%d' % (len(categories) + 1)
    num_cache = etree.SubElement(num_ref, qn('c:numCache'))
    etree.SubElement(num_cache, qn('c:formatCode')).text = '0.0'
    etree.SubElement(num_cache, qn('c:ptCount')).set('val', str(len(categories)))
    for i in range(len(categories)):
        pt = etree.SubElement(num_cache, qn('c:pt'))
        pt.set('idx', str(i))
        etree.SubElement(pt, qn('c:v')).text = str(avg_value)
    etree.SubElement(ser, qn('c:smooth')).set('val', '0')
    etree.SubElement(line_chart, qn('c:marker')).set('val', '1')
    for ax_id in ax_ids:
        etree.SubElement(line_chart, qn('c:axId')).set('val', ax_id)

    bar_chart.addnext(line_chart)
    return chart.plots[1]


def add_column_chart_with_average(slide, left, top, width, height, title, categories, values,
                                   bar_color=NAVY, avg_color=RED, value_fmt="{:.0f}",
                                   avg_label_fmt="Середнє: {:.1f}", font="Verdana"):
    """A clean, single-color vertical column chart with a dashed average
    reference line across all categories — the "how does everyone
    compare to the network average" shape (confirmed request: Adam
    explicitly wanted every bar the same color, no per-category
    highlight, plus the average as a line, not just a table). Uses
    `_inject_average_line` since python-pptx has no combo-chart support.
    Must be COLUMN (vertical) — see that function's docstring for why a
    horizontal BAR chart can't carry a line series."""
    avg_value = sum(values) / len(values)
    chart_data = CategoryChartData()
    chart_data.categories = categories
    chart_data.add_series(title, values)
    gframe = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, left, top, width, height, chart_data)
    chart = gframe.chart
    chart.has_legend = False
    chart.has_title = False
    plot = chart.plots[0]
    plot.gap_width = 45
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.number_format = value_fmt.replace("{:.0f}", "0").replace("{:.1f}", "0.0")
    dl.number_format_is_linked = False
    dl.font.size = Pt(12)
    dl.font.bold = True
    dl.font.name = font
    dl.font.color.rgb = bar_color
    series = plot.series[0]
    series.format.fill.solid()
    series.format.fill.fore_color.rgb = bar_color
    series.format.line.fill.background()
    chart.category_axis.tick_labels.font.size = Pt(12)
    chart.category_axis.tick_labels.font.name = font
    chart.category_axis.tick_labels.font.bold = True
    chart.category_axis.has_major_gridlines = False
    chart.category_axis.format.line.color.rgb = RGBColor(0xC7, 0xD0, 0xE6)
    chart.value_axis.visible = False
    chart.value_axis.has_major_gridlines = False

    avg_label = avg_label_fmt.format(avg_value).replace(".", ",")  # Ukrainian decimal comma
    line_plot = _inject_average_line(chart, categories, avg_value, avg_color, avg_label)
    line_series = line_plot.series[0]
    last_pt = list(line_series.points)[-1]
    last_pt.data_label.has_text_frame = True
    last_pt.data_label.text_frame.text = avg_label
    for run in last_pt.data_label.text_frame.paragraphs[0].runs:
        run.font.size = Pt(11)
        run.font.bold = True
        run.font.name = font
        run.font.color.rgb = avg_color
    return gframe
