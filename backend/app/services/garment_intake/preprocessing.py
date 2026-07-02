import io
from dataclasses import dataclass
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.services.garment_intake.background_removal import remove_background
from app.services.garment_intake.mask_utils import mask_coverage_ratio, normalize_onto_canvas


class InvalidGarmentImageError(ValueError):
    pass


@dataclass
class GarmentIntakeResult:
    garment_id: str
    original_filename: str
    width: int
    height: int
    mask_coverage_ratio: float
    had_transparent_source: bool
    original_url: str
    clean_url: str


def _load_image(raw_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except UnidentifiedImageError as error:
        raise InvalidGarmentImageError("Uploaded file is not a readable image.") from error

    return image


def process_garment_upload(raw_bytes: bytes, original_filename: str) -> GarmentIntakeResult:
    source_image = _load_image(raw_bytes)
    had_transparent_source = source_image.mode == "RGBA" and source_image.getchannel("A").getextrema()[0] < 255

    garment_id = str(uuid4())
    garment_dir = settings.garments_dir / garment_id
    garment_dir.mkdir(parents=True, exist_ok=True)

    source_image.convert("RGBA").save(garment_dir / "original.png")

    background_removed = source_image if had_transparent_source else remove_background(source_image)
    clean_image = normalize_onto_canvas(
        background_removed,
        canvas_size=settings.garment_canvas_size,
        padding_ratio=settings.garment_canvas_padding_ratio,
    )
    clean_image.save(garment_dir / "clean.png")

    return GarmentIntakeResult(
        garment_id=garment_id,
        original_filename=original_filename,
        width=clean_image.width,
        height=clean_image.height,
        mask_coverage_ratio=round(mask_coverage_ratio(clean_image), 4),
        had_transparent_source=had_transparent_source,
        original_url=f"{settings.data_url_prefix}/garments/{garment_id}/original.png",
        clean_url=f"{settings.data_url_prefix}/garments/{garment_id}/clean.png",
    )
