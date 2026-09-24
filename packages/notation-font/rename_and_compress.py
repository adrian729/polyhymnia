"""Post-process a pyftsubset OTF: rename CFF fontName + name table IDs 1/4/6/16
to the renamed family (OFL rename obligation, font.md), then save as WOFF2.
--name-IDs='' leaves the name table empty and the CFF fontName untouched —
this fills both back in under the new name.
"""
import sys
from fontTools.ttLib import TTFont

src, dst_otf, dst_woff2, family = sys.argv[1:5]

font = TTFont(src)

cff = font['CFF ']
top_dict = cff.cff.topDictIndex[0]
top_dict.rawDict['FontName'] = family
cff.cff.fontNames = [family]

name = font['name']
for name_id in (1, 4, 6, 16):
    name.setName(family, name_id, 3, 1, 0x409)  # Windows, Unicode BMP, en-US
    name.setName(family, name_id, 1, 0, 0)       # Mac, Roman, English

font.save(dst_otf)

font.flavor = 'woff2'
font.save(dst_woff2)
print(f'Renamed to "{family}", wrote {dst_otf} and {dst_woff2}')
