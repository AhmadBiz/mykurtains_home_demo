#!/usr/bin/env python3
"""
Downloads CC0 PBR textures from Poly Haven (https://polyhaven.com, CC0 licence) and an HDRI,
resizes / re-encodes them for the web and writes them under public/textures/<id>/ and public/hdri/.
Also writes public/textures/manifest.json and public/textures/CREDITS.md.

Usage: python3 -I scripts/fetch-textures.py [--work /tmp/dir]
"""
import io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'textures')
HDRI_OUT = os.path.join(ROOT, 'public', 'hdri')
WORK = sys.argv[sys.argv.index('--work') + 1] if '--work' in sys.argv else '/tmp/polyhaven-raw'
os.makedirs(WORK, exist_ok=True)

# id, size, maps, real-world size of one tile in metres (for repeat scaling), purpose
TEXTURES = [
    ('wood_floor',            1024, ['diff', 'nor_gl', 'rough'], 2.0, 'hardwood floors'),
    ('laminate_floor_02',     1024, ['diff', 'nor_gl', 'rough'], 2.0, 'laminate floors (basement)'),
    ('floor_tiles_06',        1024, ['diff', 'nor_gl', 'rough'], 2.0, 'tile floors (kitchen, baths, vestibule)'),
    ('concrete_floor_02',      512, ['diff', 'nor_gl', 'rough'], 2.0, 'concrete / epoxy floors (garage, mechanical, storage)'),
    ('fabric_pattern_07',      512, ['diff', 'nor_gl', 'rough'], 1.0, 'carpet (tinted)'),
    ('white_plaster_02',       512, ['nor_gl', 'rough'],         2.0, 'interior walls (colour from the room)'),
    ('red_brick_03',          1024, ['diff', 'nor_gl', 'rough'], 2.0, 'brick facade, ground storey'),
    ('concrete_wall_008',      512, ['diff', 'nor_gl', 'rough'], 2.0, 'exposed foundation'),
    ('roof_slates_03',        1024, ['diff', 'nor_gl', 'rough'], 2.0, 'roof'),
    ('aerial_grass_rock',     1024, ['diff', 'nor_gl', 'rough'], 4.0, 'lawn'),
    ('asphalt_02',             512, ['diff', 'nor_gl', 'rough'], 3.0, 'driveway, street'),
    ('pavement_02',            512, ['diff', 'nor_gl', 'rough'], 2.0, 'walkway, porch, patio'),
    ('weathered_brown_planks', 512, ['diff', 'nor_gl', 'rough'], 2.0, 'balcony deck, fence'),
    ('marble_01',              512, ['diff', 'nor_gl', 'rough'], 2.0, 'counters'),
    ('wood_table_001',         512, ['diff', 'nor_gl', 'rough'], 1.0, 'furniture wood (oak)'),
    ('dark_wood',              512, ['diff', 'nor_gl', 'rough'], 1.0, 'furniture wood (walnut), stair treads, wood blinds'),
    ('kitchen_wood',           512, ['diff', 'nor_gl', 'rough'], 1.0, 'cabinet doors'),
    ('brown_leather',          512, ['diff', 'nor_gl', 'rough'], 1.0, 'sofa / armchair leather'),
    ('leather_white',          512, ['diff', 'nor_gl', 'rough'], 1.0, 'light upholstery'),
    ('velour_velvet',          512, ['nor_gl', 'rough'],         0.5, 'velvet curtains (colour from the catalogue)'),
    ('fabric_pattern_05',      512, ['nor_gl', 'rough'],         0.5, 'linen curtains / roman & cellular shades (colour from the catalogue)'),
    ('bark_brown_02',          512, ['diff', 'nor_gl', 'rough'], 1.0, 'tree trunks'),
]
HDRI = ('kloofendal_48d_partly_cloudy_puresky', 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr')

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    req = urllib.request.Request(url, headers={'User-Agent': 'mykurtains-demo-asset-fetch'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        f.write(r.read())
    return dest

def files_for(tid):
    req = urllib.request.Request(f'https://api.polyhaven.com/files/{tid}', headers={'User-Agent': 'mykurtains-demo-asset-fetch'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

manifest = {}
total = 0
for tid, size, maps, metres, purpose in TEXTURES:
    d = os.path.join(OUT, tid)
    os.makedirs(d, exist_ok=True)
    entry = {'size': size, 'metres': metres, 'purpose': purpose, 'maps': {}}
    files = files_for(tid)
    keys = {'diff': 'Diffuse', 'nor_gl': 'nor_gl', 'rough': 'Rough'}
    for m in maps:
        key = keys[m]
        src = files.get(key, {}).get('1k', {}).get('jpg', {}).get('url')
        from_arm = False
        if not src and m == 'rough':
            src = files.get('arm', {}).get('1k', {}).get('jpg', {}).get('url')
            from_arm = bool(src)
        if not src:
            print(f'  {tid}: no {m} map, skipped')
            continue
        raw = fetch(src, os.path.join(WORK, f'{tid}_{m}.jpg'))
        img = Image.open(raw).convert('RGB')
        if from_arm:
            # arm = AO (R), Roughness (G), Metalness (B)
            g = img.split()[1]
            img = Image.merge('RGB', (g, g, g))
        if img.width != size:
            img = img.resize((size, size), Image.LANCZOS)
        name = {'diff': 'diff', 'nor_gl': 'nor', 'rough': 'rough'}[m]
        out = os.path.join(d, f'{name}.jpg')
        img.save(out, 'JPEG', quality=92 if m == 'nor_gl' else 84, optimize=True, progressive=True)
        entry['maps'][name] = f'textures/{tid}/{name}.jpg'
        total += os.path.getsize(out)
    manifest[tid] = entry
    print(f'{tid:24s} {size}px  {", ".join(entry["maps"])}')

os.makedirs(HDRI_OUT, exist_ok=True)
hdr = fetch(HDRI[1], os.path.join(WORK, 'sky.hdr'))
hdr_out = os.path.join(HDRI_OUT, 'sky_1k.hdr')
with open(hdr, 'rb') as s, open(hdr_out, 'wb') as t:
    t.write(s.read())
total += os.path.getsize(hdr_out)
print(f'hdri {HDRI[0]} -> public/hdri/sky_1k.hdr ({os.path.getsize(hdr_out)//1024} KB)')

with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
with open(os.path.join(ROOT, 'src', 'data', 'textures.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
with open(os.path.join(OUT, 'CREDITS.md'), 'w') as f:
    f.write('# Texture credits\n\nAll textures and the HDRI in `public/textures` and `public/hdri` come from [Poly Haven](https://polyhaven.com) '
            'and are released under the CC0 1.0 licence (public domain). They were downscaled and re-encoded for the web.\n\n')
    for tid, size, maps, metres, purpose in TEXTURES:
        f.write(f'- `{tid}` — https://polyhaven.com/a/{tid} — {purpose}\n')
    f.write(f'- `{HDRI[0]}` (HDRI) — https://polyhaven.com/a/{HDRI[0]}\n')
print(f'TOTAL {total/1024/1024:.1f} MB')
