#!/usr/bin/env python3
"""Generate a JYSK 'campaign badge' SVG: black circle outline + blue sunburst
+ one or two diagonal ribbon banners with bold italic outlined text.

This is the recurring illustration formula behind SIMPLIFY, EFFICIENCY,
BEST PRACTICE, GO EXECUTE, GO DIGITAL, TOP 5, SALES ATTITUDE, SLEEP
CHALLENGE, etc. Hand/fist/object illustrations on top of this base are
NOT attempted here (photorealistic shaded art doesn't hand-draw well as
flat SVG) — ask for the source file when pixel-fidelity on the
illustration matters; this generator nails the reusable base + text.
"""
import math, html, sys

LIGHT_BLUE = "#63C7F2"
DARK_BLUE_RAY = "#3FA9E0"
RIBBON_TOP = "#2E75B5"
RIBBON_BOTTOM = "#0F2D5C"
BLACK = "#111111"

def sunburst_wedges(cx, cy, r, n=40):
    wedges = []
    step = 360 / n
    for i in range(n):
        a0 = math.radians(i * step)
        a1 = math.radians((i + 1) * step)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        color = LIGHT_BLUE if i % 2 == 0 else DARK_BLUE_RAY
        wedges.append(f'<path d="M{cx},{cy} L{x0:.1f},{y0:.1f} A{r},{r} 0 0,1 {x1:.1f},{y1:.1f} Z" fill="{color}"/>')
    return "".join(wedges)

def ribbon(cx, cy, w, h, text, angle=-6, font_size=54, id_suffix=""):
    """One diagonal ribbon banner centered at (cx,cy)."""
    gid = f"rg{id_suffix}"
    x0, y0 = -w/2, -h/2
    skew = h * 0.18
    path = f"M{x0+skew},{y0} L{x0+w},{y0} L{x0+w-skew},{y0+h} L{x0},{y0+h} Z"
    shadow_off = h * 0.09
    return f'''
  <g transform="translate({cx},{cy}) rotate({angle})">
    <defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{RIBBON_TOP}"/>
      <stop offset="100%" stop-color="{RIBBON_BOTTOM}"/>
    </linearGradient></defs>
    <path d="{path}" fill="{BLACK}" transform="translate({shadow_off},{shadow_off})"/>
    <path d="{path}" fill="url(#{gid})" stroke="{BLACK}" stroke-width="4"/>
    <text x="0" y="{h*0.16}" font-family="Arial Black, Arial, sans-serif" font-style="italic"
      font-weight="900" font-size="{font_size}" fill="white" stroke="{BLACK}" stroke-width="2"
      paint-order="stroke fill" text-anchor="middle">{html.escape(text)}</text>
  </g>'''

def make_badge(lines, out_path, size=600, top_label=None):
    """lines: list of ribbon texts (1 or 2). top_label: optional small arc
    text above the circle, e.g. "JYSK'S BEST" — rendered as plain centered
    text for simplicity rather than true arc-text."""
    cx = cy = size / 2
    r_outer = size * 0.48
    r_inner = size * 0.34
    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">']
    svg_parts.append(f'<rect width="{size}" height="{size}" fill="white"/>')
    svg_parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r_outer}" fill="none" stroke="{BLACK}" stroke-width="4"/>')
    svg_parts.append(f'<clipPath id="innerclip"><circle cx="{cx}" cy="{cy}" r="{r_inner}"/></clipPath>')
    svg_parts.append(f'<g clip-path="url(#innerclip)">{sunburst_wedges(cx, cy, r_inner)}</g>')
    if top_label:
        svg_parts.append(
            f'<text x="{cx}" y="{size*0.11}" font-family="Arial Black, Arial, sans-serif" '
            f'font-weight="900" font-size="{size*0.045}" fill="{BLACK}" text-anchor="middle">{html.escape(top_label)}</text>'
        )
    n = len(lines)
    ribbon_h = size * 0.16
    ribbon_w = size * 0.92
    for i, text in enumerate(lines):
        offset = (i - (n - 1) / 2) * (ribbon_h * 0.62)
        svg_parts.append(ribbon(cx, cy + offset, ribbon_w, ribbon_h, text,
                                 angle=-6 + i * 4, font_size=size * 0.085, id_suffix=str(i)))
    svg_parts.append('</svg>')
    with open(out_path, "w") as f:
        f.write("".join(svg_parts))

if __name__ == "__main__":
    make_badge(["SIMPLIFY"], "badge_simplify.svg")
    make_badge(["EFFICIENCY"], "badge_efficiency.svg")
    make_badge(["BEST", "PRACTICE"], "badge_best_practice.svg")
    make_badge(["GO", "EXECUTE"], "badge_go_execute.svg")
    make_badge(["GO", "DIGITAL"], "badge_go_digital.svg")
    make_badge(["BEST", "CUSTOMER SERVICE"], "badge_best_customer_service.svg", top_label="JYSK'S")
    make_badge(["{{TEXT}}"], "badge_template.svg")
    print("done")
