#!/usr/bin/env python3
"""Generate a JYSK-style speech-bubble callout SVG (navy gradient blob + tail)."""
import sys, html

BLOB = ("M100,18 C138,16 176,34 182,72 C188,112 172,148 134,160 "
        "C104,169 70,168 45,150 C18,131 12,96 22,64 C32,32 66,20 100,18 Z")
TAIL = "M58,150 L34,190 L82,156 Z"

SAFE_WIDTH = 160  # usable horizontal span inside the blob at viewBox scale

def fit_size(text, size, bold):
    """Shrink size until text roughly fits SAFE_WIDTH (avg glyph ~0.58x/0.62x em)."""
    factor = 0.62 if bold else 0.55
    while size > 10 and len(text) * size * factor > SAFE_WIDTH:
        size -= 1
    return size

def make_bubble(lines, out_path, w=260, h=260, grad_id="g1"):
    """lines: list of (text, bold:bool, size:int) — size is a starting point,
    auto-shrunk to fit the bubble so future longer taglines don't overflow."""
    lines = [(text, bold, fit_size(text, size, bold)) for text, bold, size in lines]
    ty0 = 100 - (len(lines) - 1) * 15
    text_els = []
    for i, (text, bold, size) in enumerate(lines):
        y = ty0 + i * (size + 8)
        weight = "700" if bold else "400"
        text_els.append(
            f'<text x="100" y="{y}" font-family="Arial, \'Segoe UI\', sans-serif" '
            f'font-size="{size}" font-weight="{weight}" fill="white" '
            f'text-anchor="middle">{html.escape(text)}</text>'
        )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="{grad_id}" cx="30%" cy="25%" r="85%">
      <stop offset="0%" stop-color="#3E7BC4"/>
      <stop offset="55%" stop-color="#1E4C8A"/>
      <stop offset="100%" stop-color="#0F2D5C"/>
    </radialGradient>
  </defs>
  <path d="{TAIL}" fill="#0F2D5C"/>
  <path d="{BLOB}" fill="url(#{grad_id})"/>
  {"".join(text_els)}
</svg>'''
    with open(out_path, "w") as f:
        f.write(svg)

if __name__ == "__main__":
    make_bubble([("Strong teams", True, 24), ("Great engagement", False, 20)],
                "bubble_strong_teams.svg")
    make_bubble([("Proud to be", False, 20), ("JYSK", True, 30)],
                "bubble_proud_to_be_jysk.svg")
    make_bubble([("JYSK", True, 28), ("influencer", False, 22)],
                "bubble_jysk_influencer.svg")
    make_bubble([("Працюй віддано", False, 20), ("Зустрічай можливості", True, 20)],
                "bubble_pratsuy_viddano.svg")
    make_bubble([("Сильні команди", True, 20), ("Залученість кожного", False, 20)],
                "bubble_cylni_komandy.svg")
    # blank reusable template (placeholder text) for future taglines
    make_bubble([("{{ЗАГОЛОВОК}}", True, 22), ("{{підзаголовок}}", False, 18)],
                "bubble_template.svg")
    print("done")
