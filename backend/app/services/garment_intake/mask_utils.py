from PIL import Image

ALPHA_OPAQUE_THRESHOLD = 12


def alpha_bounding_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > ALPHA_OPAQUE_THRESHOLD else 0)
    return mask.getbbox()


def mask_coverage_ratio(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    opaque_pixels = sum(histogram[ALPHA_OPAQUE_THRESHOLD + 1 :])
    total_pixels = image.width * image.height
    return opaque_pixels / total_pixels if total_pixels else 0.0


def normalize_onto_canvas(
    image: Image.Image, canvas_size: int, padding_ratio: float
) -> Image.Image:
    """Crop to the garment's opaque region and center it on a square transparent canvas."""
    bbox = alpha_bounding_box(image)
    cropped = image.crop(bbox) if bbox else image

    usable_size = max(1, round(canvas_size * (1 - padding_ratio)))
    scale = min(usable_size / cropped.width, usable_size / cropped.height, 1.0) or 1.0
    target_width = max(1, round(cropped.width * scale))
    target_height = max(1, round(cropped.height * scale))
    resized = cropped.resize((target_width, target_height), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset = ((canvas_size - target_width) // 2, (canvas_size - target_height) // 2)
    canvas.paste(resized, offset, resized)
    return canvas
