"""Filter Bravura.json to the manifest's glyph subset. engravingDefaults is
global (not per-glyph) and always kept in full — font.md's `engravingDefaults`
values in architecture.md's coordinate-system table are read from here, never
hardcoded.
"""
import json
import sys

src, dst, family = sys.argv[1:4]

with open(src) as f:
    full = json.load(f)

names = sys.argv[4:]

filtered = {
    'fontName': family,
    'fontVersion': full['fontVersion'],
    'engravingDefaults': full['engravingDefaults'],
    'glyphAdvanceWidths': {n: full['glyphAdvanceWidths'][n] for n in names if n in full['glyphAdvanceWidths']},
    'glyphBBoxes': {n: full['glyphBBoxes'][n] for n in names if n in full['glyphBBoxes']},
    'glyphsWithAnchors': {n: full['glyphsWithAnchors'][n] for n in names if n in full.get('glyphsWithAnchors', {})},
}

with open(dst, 'w') as f:
    json.dump(filtered, f, separators=(',', ':'))

print(f'Wrote {dst}: {len(filtered["glyphAdvanceWidths"])} advance widths, '
      f'{len(filtered["glyphBBoxes"])} bboxes, {len(filtered["glyphsWithAnchors"])} anchor sets')
