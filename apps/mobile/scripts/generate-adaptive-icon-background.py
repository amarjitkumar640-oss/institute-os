#!/usr/bin/env python3
"""
Generates the Android adaptive-icon background image (a gradient + wave
pattern) for one tenant, from that tenant's single brand color.

This exists because Android's launcher icon can't read the app's live
ThemeContext at runtime the way the JS splash screen (AppSplashScreen.tsx)
does — it's baked into the build. So instead of hand-drawing a background
image per tenant, this script reproduces AppSplashScreen.tsx's own gradient
+ wave design in code (same darken/lighten math as ThemeContext.tsx, same
wave path data as the Waves() component's SVG), driven by one input color,
so a new tenant's icon background is one command away, not manual art.

Usage:
    python3 scripts/generate-adaptive-icon-background.py 8f2e23 \
        assets/tenants/success-tutorial/android-icon-background.png

    python3 scripts/generate-adaptive-icon-background.py 8B1E3F \
        assets/android-icon-background.png
"""

import sys
from PIL import Image, ImageDraw

SIZE = 1024  # matches this project's existing tenant foreground resolution


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


# Same formulas as darken()/lighten() in src/context/ThemeContext.tsx —
# keep these two functions byte-for-byte equivalent to that file.
def darken(rgb, amount):
    return tuple(max(0, min(255, round(c * (1 - amount)))) for c in rgb)


def lighten(rgb, amount):
    return tuple(max(0, min(255, round(c + (255 - c) * amount))) for c in rgb)


def cubic_bezier(p0, p1, p2, p3, steps=24):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = (mt**3) * p0[0] + 3 * (mt**2) * t * p1[0] + 3 * mt * (t**2) * p2[0] + (t**3) * p3[0]
        y = (mt**3) * p0[1] + 3 * (mt**2) * t * p1[1] + 3 * mt * (t**2) * p2[1] + (t**3) * p3[1]
        pts.append((x, y))
    return pts


# Same three wave paths as Waves() in AppSplashScreen.tsx, viewBox 430x340 —
# each is: start point, two cubic-bezier segments along the top edge, then
# straight down/across/closed to fill below. Keep in sync with that file.
WAVES = [
    # (start, [(cp1, cp2, end), (cp1, cp2, end)], alpha)
    ((0, 150), [((60, 210), (140, 230), (220, 205)), ((300, 180), (360, 160), (430, 185))], 0.12),
    ((0, 185), [((70, 250), (150, 260), (240, 220)), ((320, 185), (385, 180), (430, 205))], 0.18),
    ((0, 250), [((90, 295), (170, 265), (220, 225)), ((285, 170), (345, 230), (430, 180))], 0.28),
]
VIEWBOX_W, VIEWBOX_H = 430, 340


def scale(pt, sx, sy):
    return (pt[0] * sx, pt[1] * sy)


def generate(hex_color, out_path):
    rgb = hex_to_rgb(hex_color)
    top = darken(rgb, 0.06)
    bottom = lighten(rgb, 0.12)

    # Vertical gradient: darker at top, lighter at bottom (same two colors
    # AppSplashScreen.tsx uses; simplified from its diagonal angle to
    # straight-down, which reads the same at icon scale).
    base = Image.new("RGBA", (SIZE, SIZE), top + (255,))
    px = base.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b, 255)

    sx, sy = SIZE / VIEWBOX_W, SIZE / VIEWBOX_H

    for start, segments, alpha in WAVES:
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        points = [scale(start, sx, sy)]
        cursor = start
        for cp1, cp2, end in segments:
            points.extend(cubic_bezier(scale(cursor, sx, sy), scale(cp1, sx, sy), scale(cp2, sx, sy), scale(end, sx, sy)))
            cursor = end
        points.append(scale((VIEWBOX_W, VIEWBOX_H), sx, sy))
        points.append(scale((0, VIEWBOX_H), sx, sy))
        draw.polygon(points, fill=(255, 255, 255, round(255 * alpha)))
        base = Image.alpha_composite(base, layer)

    base.convert("RGBA").save(out_path)
    print(f"Wrote {out_path} ({SIZE}x{SIZE}) from #{hex_color} -> top #{'%02x%02x%02x' % top} / bottom #{'%02x%02x%02x' % bottom}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
