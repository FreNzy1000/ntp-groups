from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
MASTER = 1024


def rounded_vertical_gradient(draw_img, box, radius, top, bottom):
    x0, y0, x1, y1 = box
    width = x1 - x0
    height = y1 - y0
    grad = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        gd.line((0, y, width, y), fill=color)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    draw_img.alpha_composite(Image.composite(grad, Image.new("RGBA", grad.size), mask), (x0, y0))


def make_master():
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # The group container itself is the icon silhouette. There is no outer card/background.
    outer = (92, 92, 932, 932)
    outer_radius = 190
    rounded_vertical_gradient(img, outer, outer_radius, (35, 39, 48, 255), (12, 15, 21, 255))

    # Gentle inner rim, fully inside the group silhouette.
    d.rounded_rectangle((104, 104, 920, 920), radius=178, outline=(255, 255, 255, 24), width=8)
    d.rounded_rectangle((121, 121, 903, 903), radius=162, outline=(0, 0, 0, 82), width=8)

    tile_size = 270
    gap = 74
    left = 205
    top = 205
    positions = [
        (left, top),
        (left + tile_size + gap, top),
        (left, top + tile_size + gap),
        (left + tile_size + gap, top + tile_size + gap),
    ]

    for i, (x, y) in enumerate(positions):
        box = (x, y, x + tile_size, y + tile_size)
        if i == 3:
            rounded_vertical_gradient(img, box, 72, (48, 141, 255, 255), (7, 92, 235, 255))
            edge = (106, 181, 255, 160)
        else:
            rounded_vertical_gradient(img, box, 72, (91, 97, 109, 255), (47, 52, 62, 255))
            edge = (173, 179, 190, 92)
        d.rounded_rectangle(box, radius=72, outline=edge, width=8)
        d.rounded_rectangle((x + 13, y + 13, x + tile_size - 13, y + tile_size - 13), radius=61,
                            outline=(0, 0, 0, 82), width=7)

    # Three pale diagonal claw scratches on the blue tile.
    bx, by = positions[3]
    scratches = [
        ((bx + 76, by + 170), (bx + 142, by + 102)),
        ((bx + 121, by + 195), (bx + 188, by + 125)),
        ((bx + 167, by + 211), (bx + 225, by + 151)),
    ]
    for p0, p1 in scratches:
        d.line((*p0, *p1), fill=(220, 239, 255, 230), width=18)
        d.ellipse((p0[0]-9, p0[1]-9, p0[0]+9, p0[1]+9), fill=(220, 239, 255, 230))
        d.ellipse((p1[0]-9, p1[1]-9, p1[0]+9, p1[1]+9), fill=(220, 239, 255, 230))

    return img


def make_compact_master():
    """Small-size glyph: the blue active cell only, with oversized scratches.

    A full 2x2 group is legible at 48/128 px but collapses into noise at 16/32 px.
    The compact glyph keeps the same brand element while giving the scratches enough pixels.
    """
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    outer = (104, 104, 920, 920)
    rounded_vertical_gradient(img, outer, 220, (48, 141, 255, 255), (7, 92, 235, 255))
    d.rounded_rectangle(outer, radius=220, outline=(124, 193, 255, 190), width=22)
    d.rounded_rectangle((128, 128, 896, 896), radius=196, outline=(0, 0, 0, 78), width=18)

    scratches = [
        ((282, 665), (468, 390)),
        ((421, 724), (607, 449)),
        ((560, 778), (735, 520)),
    ]
    for p0, p1 in scratches:
        color = (235, 247, 255, 255)
        width = 92
        radius = width // 2
        d.line((*p0, *p1), fill=color, width=width)
        d.ellipse((p0[0] - radius, p0[1] - radius, p0[0] + radius, p0[1] + radius), fill=color)
        d.ellipse((p1[0] - radius, p1[1] - radius, p1[0] + radius, p1[1] + radius), fill=color)

    return img


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    full = make_master()
    compact = make_compact_master()
    for size in (128, 48):
        icon = full.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(ICONS / f"icon{size}.png", optimize=True)
    for size in (32, 16):
        icon = compact.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(ICONS / f"icon{size}.png", optimize=True)
    print("generated adaptive icons: compact 16/32, full 48/128")


if __name__ == "__main__":
    main()
