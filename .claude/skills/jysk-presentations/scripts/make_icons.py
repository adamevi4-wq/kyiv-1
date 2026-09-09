#!/usr/bin/env python3
"""Generate a navy line-icon set SVG (JYSK benefits-icon style recreation)."""

NAVY = "#1B3A6B"
SW = 6.5

def g(name, body):
    return f'<g transform="translate({{tx}},{{ty}})" id="{name}">{body}</g>'

# Each icon drawn in a local 100x100 box, stroke-based, navy, no fill unless noted.
ICONS = {
"money_gift_hand": '''
  <path d="M20 70 Q20 55 35 55 L60 55 Q68 55 68 62 Q68 69 60 69 L45 69" fill="none"/>
  <path d="M20 70 Q10 78 15 88 Q40 96 65 84 L85 74 Q90 70 86 65 Q82 61 76 64 L60 69" fill="none"/>
  <circle cx="58" cy="28" r="18"/>
  <text x="58" y="34" font-size="16" text-anchor="middle" fill="{c}" stroke="none" font-weight="700">&#8364;</text>
''',
"calendar_heart": '''
  <rect x="14" y="22" width="72" height="64" rx="8"/>
  <line x1="14" y1="40" x2="86" y2="40"/>
  <line x1="30" y1="12" x2="30" y2="28"/>
  <line x1="70" y1="12" x2="70" y2="28"/>
  <path d="M50 68 C40 58 26 60 26 72 C26 82 42 90 50 96 C58 90 74 82 74 72 C74 60 60 58 50 68 Z" stroke-width="5"/>
''',
"gift_box": '''
  <rect x="18" y="42" width="64" height="46" rx="4"/>
  <line x1="18" y1="60" x2="82" y2="60"/>
  <line x1="50" y1="42" x2="50" y2="88"/>
  <path d="M50 42 C50 26 30 22 30 34 C30 44 42 42 50 42 Z"/>
  <path d="M50 42 C50 26 70 22 70 34 C70 44 58 42 50 42 Z"/>
  <rect x="14" y="30" width="72" height="14" rx="3"/>
''',
"car": '''
  <path d="M14 66 L20 44 Q24 36 34 36 L66 36 Q76 36 80 44 L86 66 Z"/>
  <line x1="10" y1="66" x2="90" y2="66"/>
  <circle cx="30" cy="70" r="9"/>
  <circle cx="70" cy="70" r="9"/>
  <line x1="24" y1="48" x2="76" y2="48"/>
''',
"healthcare": '''
  <path d="M28 16 L28 48 Q28 66 46 66 Q64 66 64 48 L64 32"/>
  <path d="M16 16 L28 16"/>
  <path d="M64 16 L64 32" />
  <circle cx="74" cy="32" r="9"/>
  <circle cx="46" cy="80" r="12"/>
''',
"masks": '''
  <circle cx="50" cy="50" r="34"/>
  <circle cx="39" cy="44" r="3.5" fill="{c}" stroke="none"/>
  <circle cx="61" cy="44" r="3.5" fill="{c}" stroke="none"/>
  <path d="M36 60 Q50 72 64 60" />
''',
"dumbbell": '''
  <line x1="20" y1="50" x2="80" y2="50"/>
  <rect x="12" y="38" width="12" height="24" rx="3"/>
  <rect x="76" y="38" width="12" height="24" rx="3"/>
  <rect x="30" y="42" width="8" height="16" rx="2"/>
  <rect x="62" y="42" width="8" height="16" rx="2"/>
''',
"discount_tag": '''
  <path d="M16 20 L52 20 L86 54 L54 86 L20 52 Z"/>
  <circle cx="30" cy="34" r="6" fill="{c}" stroke="none"/>
  <text x="60" y="66" font-size="20" text-anchor="middle" fill="{c}" stroke="none" font-weight="700">%</text>
''',
"cutlery": '''
  <line x1="30" y1="14" x2="30" y2="46"/>
  <line x1="22" y1="14" x2="22" y2="32"/>
  <line x1="38" y1="14" x2="38" y2="32"/>
  <path d="M22 32 Q30 40 38 32"/>
  <line x1="30" y1="46" x2="30" y2="90"/>
  <path d="M70 14 C58 14 58 30 70 34 L70 90"/>
''',
"shield_insurance": '''
  <path d="M50 12 L84 26 L84 52 Q84 78 50 92 Q16 78 16 52 L16 26 Z"/>
  <path d="M50 44 C44 38 34 40 34 50 C34 58 44 64 50 70 C56 64 66 58 66 50 C66 40 56 38 50 44 Z" stroke-width="5"/>
''',
"scales": '''
  <line x1="50" y1="14" x2="50" y2="80"/>
  <line x1="22" y1="30" x2="78" y2="30"/>
  <path d="M10 30 L22 30 L16 50 Q6 56 10 30 Z"/>
  <path d="M90 30 L78 30 L84 50 Q94 56 90 30 Z"/>
  <line x1="34" y1="86" x2="66" y2="86"/>
  <line x1="50" y1="80" x2="50" y2="86"/>
''',
"heart_clock": '''
  <path d="M42 30 C34 22 20 26 20 38 C20 50 34 58 42 66 C50 58 64 50 64 38 C64 26 50 22 42 30 Z" stroke-width="5"/>
  <circle cx="66" cy="66" r="20"/>
  <line x1="66" y1="66" x2="66" y2="54"/>
  <line x1="66" y1="66" x2="75" y2="70"/>
''',
"squares_flex": '''
  <rect x="16" y="16" width="30" height="30" rx="4" fill="{c}" stroke="none"/>
  <rect x="54" y="16" width="30" height="30" rx="4"/>
  <rect x="16" y="54" width="30" height="30" rx="4"/>
  <rect x="54" y="54" width="30" height="30" rx="4"/>
''',
"star_plus": '''
  <path d="M40 8 L48 28 L70 30 L54 44 L58 66 L40 55 L22 66 L26 44 L10 30 L32 28 Z"/>
  <circle cx="74" cy="74" r="16" fill="{c}" stroke="none"/>
  <line x1="74" y1="66" x2="74" y2="82" stroke="white" stroke-width="4"/>
  <line x1="66" y1="74" x2="82" y2="74" stroke="white" stroke-width="4"/>
''',
"shield_person": '''
  <path d="M50 10 L82 24 L82 50 Q82 76 50 90 Q18 76 18 50 L18 24 Z"/>
  <circle cx="50" cy="42" r="10"/>
  <path d="M34 68 Q34 52 50 52 Q66 52 66 68"/>
''',
"piggy_bank": '''
  <ellipse cx="46" cy="56" rx="32" ry="24"/>
  <circle cx="72" cy="46" r="6"/>
  <path d="M76 40 L86 34 L84 46"/>
  <line x1="30" y1="78" x2="30" y2="86"/>
  <line x1="62" y1="78" x2="62" y2="86"/>
  <rect x="42" y="30" width="10" height="4" rx="2" fill="{c}" stroke="none"/>
  <line x1="16" y1="58" x2="8" y2="58"/>
''',
"trophy_star": '''
  <path d="M32 18 L68 18 L68 40 Q68 58 50 58 Q32 58 32 40 Z"/>
  <path d="M32 24 Q14 24 18 40 Q20 50 32 48"/>
  <path d="M68 24 Q86 24 82 40 Q80 50 68 48"/>
  <line x1="50" y1="58" x2="50" y2="72"/>
  <line x1="36" y1="86" x2="64" y2="86"/>
  <line x1="50" y1="72" x2="50" y2="86"/>
  <path d="M50 24 L54 32 L62 33 L56 39 L58 47 L50 43 L42 47 L44 39 L38 33 L46 32 Z" fill="{c}" stroke="none"/>
''',
"two_people": '''
  <circle cx="32" cy="30" r="12"/>
  <path d="M14 76 Q14 52 32 52 Q50 52 50 76"/>
  <circle cx="68" cy="30" r="12"/>
  <path d="M50 76 Q50 52 68 52 Q86 52 86 76"/>
''',
"running": '''
  <circle cx="60" cy="18" r="9"/>
  <path d="M60 30 L46 50"/>
  <path d="M46 50 L22 58"/>
  <path d="M46 50 L58 66 L48 88"/>
  <path d="M58 66 L78 76"/>
  <path d="M60 30 L74 40 L82 30"/>
''',
"calendar_clock": '''
  <rect x="12" y="20" width="52" height="56" rx="6"/>
  <line x1="12" y1="36" x2="64" y2="36"/>
  <line x1="26" y1="12" x2="26" y2="26"/>
  <line x1="50" y1="12" x2="50" y2="26"/>
  <circle cx="68" cy="68" r="22"/>
  <line x1="68" y1="68" x2="68" y2="54"/>
  <line x1="68" y1="68" x2="78" y2="72"/>
''',
"high_five": '''
  <path d="M14 78 L34 44 Q40 34 48 40 L50 42"/>
  <path d="M86 78 L66 44 Q60 34 52 40 L50 42"/>
  <line x1="50" y1="42" x2="50" y2="30"/>
  <circle cx="34" cy="16" r="3" fill="{c}" stroke="none"/>
  <circle cx="66" cy="16" r="3" fill="{c}" stroke="none"/>
  <circle cx="50" cy="10" r="3" fill="{c}" stroke="none"/>
''',
"graduation_cap": '''
  <path d="M10 38 L50 20 L90 38 L50 56 Z"/>
  <path d="M28 46 L28 66 Q28 78 50 78 Q72 78 72 66 L72 46"/>
  <line x1="90" y1="38" x2="90" y2="62"/>
''',
"umbrella_euro": '''
  <path d="M14 46 Q14 14 50 14 Q86 14 86 46 Z"/>
  <line x1="50" y1="14" x2="50" y2="80"/>
  <path d="M50 80 Q50 92 62 88"/>
  <line x1="14" y1="46" x2="86" y2="46"/>
  <text x="30" y="66" font-size="16" text-anchor="middle" fill="{c}" stroke="none" font-weight="700">&#8364;</text>
''',
"umbrella_people": '''
  <path d="M14 40 Q14 12 50 12 Q86 12 86 40 Z"/>
  <line x1="50" y1="12" x2="50" y2="60"/>
  <circle cx="34" cy="70" r="8"/>
  <path d="M22 92 Q22 78 34 78 Q46 78 46 92"/>
  <circle cx="66" cy="70" r="8"/>
  <path d="M54 92 Q54 78 66 78 Q78 78 78 92"/>
''',
"hands_heart": '''
  <path d="M14 70 Q14 54 30 54 L46 54"/>
  <path d="M86 70 Q86 54 70 54 L54 54"/>
  <path d="M50 34 C44 26 30 30 30 40 C30 50 44 58 50 66 C56 58 70 50 70 40 C70 30 56 26 50 34 Z" stroke-width="5"/>
''',
"wrench_clock": '''
  <circle cx="40" cy="40" r="24"/>
  <line x1="40" y1="40" x2="40" y2="26"/>
  <line x1="40" y1="40" x2="50" y2="46"/>
  <path d="M62 58 Q56 52 62 46 Q68 40 74 46 L86 58 Q90 62 86 66 Q82 70 78 66 L66 54 Q64 60 62 58 Z"/>
''',
"ladder": '''
  <line x1="28" y1="10" x2="20" y2="90"/>
  <line x1="72" y1="10" x2="80" y2="90"/>
  <line x1="23" y1="26" x2="77" y2="26"/>
  <line x1="24" y1="46" x2="76" y2="46"/>
  <line x1="22" y1="66" x2="78" y2="66"/>
''',
"globe_hands": '''
  <circle cx="50" cy="42" r="26"/>
  <ellipse cx="50" cy="42" rx="26" ry="11"/>
  <line x1="24" y1="42" x2="76" y2="42"/>
  <line x1="50" y1="16" x2="50" y2="68"/>
  <path d="M14 84 Q14 70 30 70 L70 70 Q86 70 86 84"/>
''',
"snowflake": '''
  <line x1="50" y1="10" x2="50" y2="90"/>
  <line x1="16" y1="30" x2="84" y2="70"/>
  <line x1="16" y1="70" x2="84" y2="30"/>
  <path d="M50 10 L42 20 M50 10 L58 20"/>
  <path d="M50 90 L42 80 M50 90 L58 80"/>
''',
"bicycle": '''
  <circle cx="24" cy="70" r="16"/>
  <circle cx="76" cy="70" r="16"/>
  <path d="M24 70 L46 34 L66 34"/>
  <path d="M46 34 L66 70 L24 70"/>
  <path d="M66 70 L76 70"/>
  <circle cx="66" cy="26" r="7"/>
''',
"party": '''
  <path d="M20 88 L38 30 Q56 30 56 48 L20 88 Z"/>
  <circle cx="70" cy="22" r="3" fill="{c}" stroke="none"/>
  <circle cx="82" cy="40" r="3" fill="{c}" stroke="none"/>
  <circle cx="60" cy="12" r="3" fill="{c}" stroke="none"/>
  <line x1="72" y1="60" x2="80" y2="56"/>
  <line x1="76" y1="72" x2="86" y2="72"/>
''',
"phone_star": '''
  <rect x="30" y="10" width="40" height="80" rx="8"/>
  <line x1="42" y1="80" x2="58" y2="80"/>
  <path d="M50 32 L54 42 L64 43 L56 50 L58 60 L50 55 L42 60 L44 50 L36 43 L46 42 Z" fill="{c}" stroke="none"/>
''',
"globe": '''
  <circle cx="50" cy="50" r="38"/>
  <ellipse cx="50" cy="50" rx="38" ry="16"/>
  <line x1="12" y1="50" x2="88" y2="50"/>
  <line x1="50" y1="12" x2="50" y2="88"/>
''',
"apple_coffee": '''
  <path d="M40 30 C24 30 20 46 24 58 C28 72 36 82 40 82 C44 82 46 78 50 78 C54 78 56 82 60 82 C64 82 74 68 74 54 C74 42 66 34 56 36 C52 30 44 28 40 30 Z"/>
  <path d="M50 30 Q46 20 40 16"/>
  <rect x="60" y="58" width="26" height="20" rx="4"/>
  <path d="M86 60 Q96 60 96 68 Q96 76 86 76"/>
  <path d="M64 52 Q68 56 64 60" stroke-width="3"/>
''',
}

LABELS = list(ICONS.keys())
COLS = 7
CELL = 110
PAD = 14

svg_defs = []
body = []
for i, name in enumerate(LABELS):
    col = i % COLS
    row = i // COLS
    tx = col * CELL + PAD
    ty = row * CELL + PAD
    icon_body = ICONS[name].format(c=NAVY)
    body.append(f'<g transform="translate({tx},{ty}) scale(0.82)" '
                f'stroke="{NAVY}" stroke-width="{SW}" fill="none" '
                f'stroke-linecap="round" stroke-linejoin="round">{icon_body}</g>')

rows = (len(LABELS) + COLS - 1) // COLS
W = COLS * CELL + PAD
H = rows * CELL + PAD

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<rect width="{W}" height="{H}" fill="white"/>
{"".join(body)}
</svg>'''

with open("icons.svg", "w") as f:
    f.write(svg)

print("icons:", len(LABELS), "grid", COLS, "x", rows, "size", W, H)
