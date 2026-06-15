#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow>=10"]
# ///

"""Build a reference-vs-render PNG board for ForgeCAD image replication."""

from __future__ import annotations

import argparse
from math import ceil
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps


def positive_int(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def labels(raw: str) -> tuple[str, str]:
    values = tuple(part.strip() for part in raw.split(",") if part.strip())
    if len(values) != 2:
        raise argparse.ArgumentTypeError("must contain two comma-separated labels")
    return values


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a side-by-side comparison board from a reference image and ForgeCAD render.",
    )
    parser.add_argument("reference_image")
    parser.add_argument("forgecad_render")
    parser.add_argument("output_png")
    parser.add_argument("--height", type=positive_int, default=900, help="Panel height in pixels.")
    parser.add_argument("--panel-width", type=positive_int, default=None, help="Panel width in pixels.")
    parser.add_argument("--gap", type=positive_int, default=16, help="Gap between panels in pixels.")
    parser.add_argument("--padding", type=positive_int, default=16, help="Outer padding in pixels.")
    parser.add_argument("--background", default="#111111", help="Canvas background color.")
    parser.add_argument("--fit", choices=("contain", "cover"), default="contain", help="Image fit mode.")
    parser.add_argument("--labels", type=labels, default=("Reference", "ForgeCAD"), help="Two comma-separated labels.")
    parser.add_argument("--no-labels", action="store_true", help="Disable label band.")
    parser.add_argument(
        "--chrome-path",
        default=None,
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def open_image(path_arg: str) -> Image.Image:
    path = Path(path_arg).expanduser()
    if not path.exists():
        raise SystemExit(f"Image not found: {path}")
    try:
        image = Image.open(path)
        return ImageOps.exif_transpose(image).convert("RGBA")
    except Exception as exc:  # Pillow gives format-specific exceptions.
        raise SystemExit(f"Failed to open image {path}: {exc}") from exc


def parse_background(raw: str) -> tuple[int, int, int, int]:
    try:
        color = ImageColor.getcolor(raw, "RGBA")
    except ValueError as exc:
        raise SystemExit(f"Invalid background color {raw!r}: {exc}") from exc
    return color


def load_label_font() -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), 18)
    return ImageFont.load_default()


def scaled_to_panel(image: Image.Image, panel_width: int, panel_height: int, fit: str) -> Image.Image:
    width, height = image.size
    if width <= 0 or height <= 0:
        raise SystemExit("Image dimensions must be positive.")
    scale = (
        max(panel_width / width, panel_height / height)
        if fit == "cover"
        else min(panel_width / width, panel_height / height)
    )
    if fit == "cover":
        scaled_size = (max(panel_width, ceil(width * scale)), max(panel_height, ceil(height * scale)))
    else:
        scaled_size = (min(panel_width, max(1, round(width * scale))), min(panel_height, max(1, round(height * scale))))
    resized = image.resize(scaled_size, Image.Resampling.LANCZOS)
    if fit != "cover":
        return resized

    left = max(0, (resized.width - panel_width) // 2)
    top = max(0, (resized.height - panel_height) // 2)
    return resized.crop((left, top, left + panel_width, top + panel_height))


def paste_panel(
    board: Image.Image,
    image: Image.Image,
    *,
    x: int,
    y: int,
    panel_width: int,
    panel_height: int,
    fit: str,
) -> None:
    panel = Image.new("RGBA", (panel_width, panel_height), (0, 0, 0, 0))
    fitted = scaled_to_panel(image, panel_width, panel_height, fit)
    dx = (panel_width - fitted.width) // 2
    dy = (panel_height - fitted.height) // 2
    panel.alpha_composite(fitted, (dx, dy))
    board.alpha_composite(panel, (x, y))


def main() -> None:
    args = parse_args()
    reference = open_image(args.reference_image)
    render = open_image(args.forgecad_render)

    panel_height = args.height
    max_aspect = max(reference.width / reference.height, render.width / render.height)
    panel_width = args.panel_width or int(panel_height * max_aspect + 0.9999)
    label_values = None if args.no_labels else args.labels
    label_height = 34 if label_values else 0
    canvas_width = args.padding * 2 + panel_width * 2 + args.gap
    canvas_height = args.padding * 2 + label_height + panel_height

    board = Image.new("RGBA", (canvas_width, canvas_height), parse_background(args.background))
    draw = ImageDraw.Draw(board)
    left_x = args.padding
    right_x = args.padding + panel_width + args.gap
    panel_y = args.padding + label_height

    if label_values:
        font = load_label_font()
        for text, x in ((label_values[0], left_x), (label_values[1], right_x)):
            draw.text((x, args.padding + 4), text, fill=(255, 255, 255, 230), font=font)

    paste_panel(board, reference, x=left_x, y=panel_y, panel_width=panel_width, panel_height=panel_height, fit=args.fit)
    paste_panel(board, render, x=right_x, y=panel_y, panel_width=panel_width, panel_height=panel_height, fit=args.fit)

    outline = (255, 255, 255, 64)
    draw.rectangle((left_x, panel_y, left_x + panel_width - 1, panel_y + panel_height - 1), outline=outline)
    draw.rectangle((right_x, panel_y, right_x + panel_width - 1, panel_y + panel_height - 1), outline=outline)

    output_path = Path(args.output_png).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(output_path, "PNG")
    print(f"Wrote {output_path} ({canvas_width}x{canvas_height})")


if __name__ == "__main__":
    main()
