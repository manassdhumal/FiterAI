from functools import lru_cache

import numpy as np
from PIL import Image
from rembg import new_session, remove

from app.core.config import settings


@lru_cache(maxsize=None)
def _get_session(model_name: str):
    return new_session(model_name)


def remove_background(image: Image.Image) -> Image.Image:
    """Return an RGBA image with the background made transparent (general subject)."""
    result = remove(image, session=_get_session(settings.rembg_model_name))
    return result.convert("RGBA")


def extract_garment_from_worn_photo(image: Image.Image) -> Image.Image:
    """Isolate just the clothing region from a photo of a person wearing the
    garment, using rembg's cloth-specific segmentation model instead of general
    background removal (which would keep the whole person: skin, face, hair).

    u2net_cloth_seg's `remove()` output is a single RGBA image stacked
    vertically into 3 equal-height bands (upper-body / lower-body / full-body
    class masks, in that order per the model's training). We don't rely on
    knowing which band is which - unioning all three gives "any region the
    model identified as a garment", which is what we want regardless of
    garment type.
    """
    session = _get_session(settings.rembg_cloth_model_name)
    stacked = remove(image, session=session).convert("RGBA")

    band_height = stacked.height // 3
    if band_height <= 0:
        return stacked

    stacked_array = np.array(stacked)
    bands = [stacked_array[i * band_height : (i + 1) * band_height] for i in range(3)]
    combined_alpha = np.maximum(np.maximum(bands[0][:, :, 3], bands[1][:, :, 3]), bands[2][:, :, 3])

    # Colour comes from the original photo (bands only carry alpha reliably);
    # the combined alpha defines which pixels are "garment".
    source_rgb = np.array(image.convert("RGB").resize((stacked.width, band_height)))
    result_array = np.dstack([source_rgb, combined_alpha])
    return Image.fromarray(result_array, mode="RGBA")
