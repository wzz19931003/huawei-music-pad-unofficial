"""Original procedural bamboo atmosphere; no external image inputs.

The generator and artwork are distributed under the repository's AGPL-3.0-only
terms. Requires Pillow only for regeneration, not for building or running the app.
"""
from pathlib import Path
import hashlib
import math
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'src/renderer/assets/pad-cafe-atmosphere.webp'
WIDTH, HEIGHT = 1600, 900
rng = random.Random(934210)
base = Image.new('RGB', (WIDTH, HEIGHT))
pixels = base.load()
for y in range(HEIGHT):
    for x in range(WIDTH):
        light = math.exp(-(((x - 510) / 650) ** 2 + ((y - 140) / 620) ** 2))
        ground = y / HEIGHT
        pixels[x, y] = (int(12 + light * 31 + ground * 7), int(31 + light * 48 + ground * 13), int(27 + light * 29 + ground * 8))
base = base.convert('RGBA')

def foliage(draw, origin, angle, scale, color):
    ox, oy = origin
    length = rng.uniform(50, 140) * scale
    ex, ey = ox + math.cos(angle) * length, oy + math.sin(angle) * length
    draw.line((ox, oy, ex, ey), fill=color, width=max(1, round(scale * 2)))
    for index in range(3, 9):
        t = index / 10
        px, py = ox + (ex - ox) * t, oy + (ey - oy) * t
        side = -1 if index % 2 else 1
        direction = angle + side * .75
        leaf_length = rng.uniform(26, 64) * scale
        leaf_width = leaf_length * .11
        tip = (px + math.cos(direction) * leaf_length, py + math.sin(direction) * leaf_length)
        mid = (px + (tip[0] - px) * .5, py + (tip[1] - py) * .5)
        normal = (-math.sin(direction) * leaf_width, math.cos(direction) * leaf_width)
        draw.polygon([(px, py), (mid[0] + normal[0], mid[1] + normal[1]), tip, (mid[0] - normal[0] * .4, mid[1] - normal[1] * .4)], fill=color)

for layer, count, blur in [(0, 50, 9), (1, 29, 3.5), (2, 13, .5)]:
    canvas = Image.new('RGBA', base.size)
    draw = ImageDraw.Draw(canvas)
    for index in range(count):
        x0 = rng.uniform(-100, WIDTH + 100)
        tilt = rng.uniform(-.16, .16)
        width = rng.uniform(6, 14) if layer == 0 else rng.uniform(12, 26) if layer == 1 else rng.uniform(28, 46)
        alpha = 90 if layer == 0 else 155 if layer == 1 else 220
        tint = rng.uniform(.75, 1.25)
        for stripe in range(max(4, round(width))):
            n = stripe / max(1, round(width) - 1)
            cylinder = .35 + .65 * math.sin(n * math.pi)
            color = (int((23 + cylinder * 34) * tint), int((52 + cylinder * 49) * tint), int((29 + cylinder * 24) * tint), alpha)
            xa = x0 + stripe - width / 2
            draw.line((xa - tilt * HEIGHT, -30, xa, HEIGHT + 30), fill=color, width=2)
        segment = rng.uniform(155, 240)
        y = rng.uniform(-120, 0)
        while y < HEIGHT + 100:
            node_x = x0 - tilt * (HEIGHT - y)
            draw.line((node_x - width / 2, y, node_x + width / 2, y), fill=(15, 35, 18, alpha), width=4 if layer == 2 else 2)
            draw.line((node_x - width / 2 + 1, y + 3, node_x + width / 2 - 1, y + 3), fill=(96, 125, 64, round(alpha * .8)), width=2)
            if layer > 0 and rng.random() < .8:
                direction = rng.choice([-1, 1])
                foliage(draw, (node_x, y), -.35 if direction > 0 else math.pi + .35, .65 if layer == 1 else 1.1, (23, 55, 29, alpha))
            y += segment
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    base = Image.alpha_composite(base, canvas)

mist = Image.new('RGBA', base.size)
draw = ImageDraw.Draw(mist)
for index in range(70):
    x, y = rng.uniform(0, WIDTH), rng.uniform(0, HEIGHT)
    radius = rng.uniform(4, 32)
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(179, 202, 132, rng.randint(5, 18)))
mist = mist.filter(ImageFilter.GaussianBlur(16))
base = Image.alpha_composite(base, mist)
base.convert('RGB').save(OUTPUT, format='WEBP', quality=92, method=6)
print(f'{OUTPUT}: {WIDTH}x{HEIGHT}; sha256={hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}')
