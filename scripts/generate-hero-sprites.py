"""Generates the mounted-archer sprite strip (project-owned art, CC0).

Flat geometric style matched to Kenney Medieval RTS. Side view facing
right (the game mirrors for left). Four 128px frames in one strip:
idle, gallop-0 (extended), gallop-1 (gathered), gallop-2 (mid).

  python scripts/generate-hero-sprites.py
  -> public/assets/sprites/hero.png (512x128)

Drawn at 4x and downsampled for clean edges. Requires Pillow.
"""

from PIL import Image, ImageDraw
import math
import os

S = 4  # supersample factor; canvas is 128*S
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites', 'hero.png')

HORSE = (156, 106, 63)
HORSE_DARK = (125, 83, 48)
MANE = (93, 61, 34)
SADDLE = (196, 69, 46)
TUNIC = (74, 114, 196)
TUNIC_DARK = (58, 92, 164)
HELM = (141, 146, 153)
SKIN = (232, 184, 138)
BOW = (217, 201, 164)
SHADOW = (0, 0, 0, 55)


def rr(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def leg(d, hip, angle_deg, length, width, color):
    """A leg as a thick capsule from the hip at an angle (0 = straight down)."""
    a = math.radians(angle_deg)
    x0, y0 = hip
    x1 = x0 + math.sin(a) * length
    y1 = y0 + math.cos(a) * length
    d.line([hip, (x1, y1)], fill=color, width=width)
    r = width / 2
    d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=color)
    d.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=color)


def draw_frame(pose):
    """pose: dict(front, back, bob) — leg angles in degrees, body bob px (at 1x)."""
    img = Image.new('RGBA', (128 * S, 128 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bob = pose['bob'] * S

    # baseline geometry (at 4x): ground at y≈470
    body_top = 250 + bob
    body_bot = 350 + bob

    # tail (behind body)
    d.polygon(
        [(150, body_top + 30), (95, body_top + 70), (110, body_top + 110), (155, body_top + 75)],
        fill=MANE,
    )

    # legs (under body): hips at rear ~(175) and front ~(320)
    lw = 26
    leg(d, (180, body_bot - 20), pose['back'], 120, lw, HORSE_DARK)
    leg(d, (215, body_bot - 20), pose['back'] * 0.6, 120, lw, HORSE)
    leg(d, (305, body_bot - 20), pose['front'] * 0.6, 120, lw, HORSE)
    leg(d, (340, body_bot - 20), pose['front'], 120, lw, HORSE_DARK)

    # body
    rr(d, (140, body_top, 360, body_bot), 55, HORSE)
    # rump shading
    d.ellipse((140, body_top + 8, 230, body_bot - 4), fill=HORSE)

    # neck + head
    d.polygon(
        [(320, body_top + 40), (330, body_top - 60), (390, body_top - 78), (368, body_top + 55)],
        fill=HORSE,
    )
    rr(d, (352, body_top - 108, 452, body_top - 48), 26, HORSE)
    # muzzle
    rr(d, (424, body_top - 96, 462, body_top - 52), 18, HORSE_DARK)
    # ear
    d.polygon([(368, body_top - 108), (380, body_top - 138), (394, body_top - 106)], fill=HORSE_DARK)
    # eye
    d.ellipse((392, body_top - 92, 406, body_top - 78), fill=(40, 32, 24))
    # mane along the neck
    d.polygon(
        [(330, body_top - 62), (352, body_top - 104), (368, body_top - 96), (350, body_top + 30), (330, body_top + 34)],
        fill=MANE,
    )

    # saddle
    rr(d, (218, body_top - 12, 310, body_top + 40), 18, SADDLE)

    # rider (leans slightly forward while galloping)
    lean = pose['lean'] * S
    rx = 232 + lean
    # rider leg visible against the saddle
    rr(d, (rx + 14, body_top + 8, rx + 52, body_top + 66), 16, TUNIC_DARK)
    # torso
    rr(d, (rx, body_top - 110, rx + 62, body_top + 10), 24, TUNIC)
    # bow arm reaching up-forward
    rr(d, (rx + 34, body_top - 108, rx + 100, body_top - 80), 15, TUNIC)
    d.ellipse((rx + 86, body_top - 122, rx + 114, body_top - 94), fill=SKIN)
    # head + helm
    d.ellipse((rx + 4, body_top - 156, rx + 58, body_top - 102), fill=SKIN)
    d.pieslice((rx - 2, body_top - 170, rx + 64, body_top - 104), 180, 360, fill=HELM)
    rr(d, (rx - 2, body_top - 140, rx + 64, body_top - 126), 7, HELM)

    # bow (arc) at the reaching hand, held high in front of the rider
    cx, cy = rx + 104, body_top - 108
    r = 54
    d.arc((cx - r, cy - r, cx + r, cy + r), -62, 62, fill=BOW, width=11)
    x0 = cx + r * math.cos(math.radians(-62))
    y0 = cy + r * math.sin(math.radians(-62))
    x1 = cx + r * math.cos(math.radians(62))
    y1 = cy + r * math.sin(math.radians(62))
    d.line([(x0, y0), (x1, y1)], fill=(245, 240, 225), width=4)

    return img.resize((128, 128), Image.LANCZOS)


POSES = [
    {'front': 0, 'back': 0, 'bob': 0, 'lean': 0},      # idle
    {'front': 34, 'back': -30, 'bob': -2, 'lean': 4},  # gallop extended
    {'front': -18, 'back': 16, 'bob': 1, 'lean': 4},   # gallop gathered
    {'front': 12, 'back': -8, 'bob': -1, 'lean': 4},   # gallop mid
]

strip = Image.new('RGBA', (128 * len(POSES), 128), (0, 0, 0, 0))
for i, pose in enumerate(POSES):
    strip.paste(draw_frame(pose), (i * 128, 0))
strip.save(OUT)
print('wrote', os.path.normpath(OUT))
